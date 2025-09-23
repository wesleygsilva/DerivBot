const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

// Importar utilitários
const SequenceTracker = require("./utils/SequenceTracker");
const Logger = require("./utils/Logger");
const DerivAPI = require("./api/DerivAPI");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

// servir arquivos estáticos
app.use(express.static(__dirname + "/public"));

// =========================
// CONFIG - Agora todas as configurações são dinâmicas
// =========================
let config = {
  strategy: "EvenOdd", // estratégia inicial
  contract_type: "DIGITODD",
  duration: 1,
  symbol: "1HZ10V",
  baseStake: 0.35,
  multiplier: 2.2,
  maxMartingale: 8,
  payout: 0.95,
  minEven: 6,
  minOdd: 6,
  profitGoal: 0,
};

// =========================
// ESTADO DO BOT
// =========================
let botState = {
  connected: false,
  isRunning: false,
  makingEntry: false,
  lastDigits: [],
  balance: 0,
  initialBalance: 0,      
  stats: { profit: 0, totalTrades: 0, wins: 0, losses: 0 },
  strategyState: {}, // Estado específico da estratégia
};

// =========================
// INSTÂNCIAS DOS MÓDULOS
// =========================
const logger = new Logger(io);
const sequenceTracker = new SequenceTracker(logger);
const derivAPI = new DerivAPI(logger);

// =========================
// CARREGAR ESTRATÉGIAS DINAMICAMENTE
// =========================
const strategies = {};
const strategiesDir = path.join(__dirname, "strategies");

fs.readdirSync(strategiesDir).forEach(file => {
  if (file.endsWith(".js")) {
    const StrategyClass = require(path.join(strategiesDir, file));
    const strategyName = path.basename(file, ".js");
    strategies[strategyName] = new StrategyClass(config, logger);
    logger.log(`Estratégia carregada: ${strategyName}`);
  }
});

let currentStrategy = strategies[config.strategy];

// =========================
// CONTROLE DE TRADES
// =========================
let localTrades = {};
let tradeCounter = 0;

// =========================
// UTILS
// =========================
function ensureValidNumber(value, defaultValue = 1.0) {
  const num = parseFloat(value);
  return isNaN(num) || num <= 0 ? defaultValue : num;
}

// =========================
// VERIFICAR META DE LUCRO
// =========================
function checkProfitGoal() {
  if (config.profitGoal > 0 && botState.stats.profit >= config.profitGoal) {
    botState.isRunning = false;
    logger.log(`Meta de lucro atingida! Lucro atual: $${botState.stats.profit.toFixed(2)} | Meta: $${config.profitGoal.toFixed(2)}`, "success");
    io.emit("botStateUpdate", botState);
    return true;
  }
  return false;
}

// =========================
// TICKS E RESULTADOS
// =========================
function handleTick(tick) {
  if (!botState.isRunning) return;

  const quote = tick.quote.toString();
  const lastDigit = parseInt(quote.slice(-1));

  botState.lastDigits.push(lastDigit);
  if (botState.lastDigits.length > 20) botState.lastDigits.shift();

  // Atualizar estatísticas de sequência
  sequenceTracker.updateSequenceStats(lastDigit);

  // Resolver trades abertos
  resolveOpenTrades(lastDigit);

  // Se a estratégia/parada foi acionada ao resolver trades (ex.: gale máximo),
  // não processamos novas entradas neste mesmo tick.
  if (!botState.isRunning) {
    io.emit("botStateUpdate", botState);
    return;
  }

  // Processar lógica da estratégia atual
  if (currentStrategy) {
    const decision = currentStrategy.processSignal(lastDigit, botState.strategyState);
    
    if (decision.shouldTrade) {
      makeEntryAsync(lastDigit, decision.entryType, decision.reason);
    }
  }

  io.emit("botStateUpdate", botState);
}

function resolveOpenTrades(lastDigit) {
  // snapshot das chaves para evitar surpresas se localTrades for modificado durante o loop
  const tradeIds = Object.keys(localTrades);

  for (const id of tradeIds) {
    const trade = localTrades[id];
    if (trade && trade.status === "open") {
      const isWin = (trade.entryType === "DIGITODD") ? lastDigit % 2 === 1 : lastDigit % 2 === 0;
      
      trade.resultDigit = lastDigit;
      trade.status = isWin ? "win" : "loss";     

      botState.stats.totalTrades++;
      if (isWin) {
        botState.stats.wins++;
        // Log do resultado primeiro (assim aparece antes dos logs da estratégia)
        logger.log(`Trade #${trade.id} WIN | Entrada após digito: ${trade.entryDigit} → Resultado: ${trade.resultDigit}`);

        // Notificar estratégia sobre WIN (pode resetar estado)
        if (currentStrategy) {
          try {
            currentStrategy.onTradeResult(trade, botState.strategyState, true);
          } catch (err) {
            logger.log(`Erro em onTradeResult (win): ${err.message}`, "error");
          }
        }

        // Verificar meta de lucro após win
        if (checkProfitGoal()) {
          io.emit("tradeResult", trade);
          return;
        }
      } else {
        botState.stats.losses++;
        // Log do resultado primeiro (para aparecer antes do "Preparando Gale")
        logger.log(`Trade #${trade.id} LOSS | Entrada após dígito: ${trade.entryDigit} → Resultado: ${trade.resultDigit}`, "error");

        // Notificar estratégia sobre LOSS
        if (currentStrategy) {
          try {
            const shouldContinue = currentStrategy.onTradeResult(trade, botState.strategyState, false);
            if (!shouldContinue) {
              // estratégia pediu para parar => garantir que nenhuma nova entrada seja feita
              botState.isRunning = false;
              botState.makingEntry = false;
              logger.log(`Estratégia interrompida. Bot parado.`, "error");
            }
          } catch (err) {
            logger.log(`Erro em onTradeResult (loss): ${err.message}`, "error");
          }
        }
      }

      io.emit("tradeResult", trade);
    }
  }
}


// =========================
// FAZER ENTRADA
// =========================
function makeEntryAsync(lastDigit = null, entryType = "DIGITODD", reason = "") {
  if (!botState.connected || !botState.isRunning) {
    // garantir que flag de tentativa de entrada seja resetada
    botState.makingEntry = false;
    return;
  }

  const rawStake = currentStrategy ? currentStrategy.getCurrentStake(botState.strategyState) : config.baseStake;
  const stake = parseFloat(Number(rawStake).toFixed(2));
  
  if (stake > botState.balance) {
    botState.isRunning = false;
    botState.makingEntry = false;
    logger.log("Saldo insuficiente. Bot parado.", "error");
    return;
  }

  const id = ++tradeCounter;
  localTrades[id] = {
    id,
    stake: stake,
    entryDigit: lastDigit,
    entryType,
    status: "open",
    timestamp: Date.now(),
    reason: reason
  };

  const proposalRequest = {
    proposal: 1,
    amount: stake,
    basis: "stake",
    contract_type: entryType,
    currency: "USD",
    duration: config.duration,
    duration_unit: "t",
    symbol: config.symbol
  };

  botState.makingEntry = true;
  try {
    derivAPI.sendMessage(proposalRequest);
  } catch (error) {
    botState.makingEntry = false;
    logger.log("Erro ao enviar proposta", "error");
  }

  io.emit("tradePending", localTrades[id]);
  logger.log(`Trade #${id} lançado | ${reason} | Entrada ${entryType} após dígito: ${lastDigit} | Stake: ${stake}`);
}


// =========================
// SOCKET.IO
// =========================
io.on("connection", (socket) => {
  // Enviar estado e configurações para o cliente
  socket.emit("botStateUpdate", botState);
  socket.emit("configUpdate", config);

  socket.on("connect_bot", (token) => {
    if (!token || token.trim() === "") {
      socket.emit("connectionError", "Token inválido");
      return;
    }
    derivAPI.connect(token, handleAPIResponse);
  });

  socket.on("start_bot", () => {
    if (!botState.connected) return;
    botState.isRunning = true;
    botState.makingEntry = false;
    
    // Reset da estratégia
    if (currentStrategy) {
      botState.strategyState = currentStrategy.reset();
    }
    
    logger.log("Bot iniciado");
    io.emit("botStateUpdate", botState);
  });

  socket.on("stop_bot", () => {
    botState.isRunning = false;
    botState.makingEntry = false;
    logger.log("Bot parado", "warning");
    io.emit("botStateUpdate", botState);
  });

  socket.on("update_config", (newConfig) => {
    updateConfig(newConfig);
  });

  socket.on("change_strategy", (strategyName) => {
    if (strategies[strategyName]) {
      config.strategy = strategyName;
      currentStrategy = strategies[strategyName];
      currentStrategy.updateConfig(config);
      botState.strategyState = currentStrategy.reset();
      
      logger.log(`Estratégia alterada para: ${strategyName}`);
      io.emit("configUpdate", config);
      io.emit("botStateUpdate", botState);
    } else {
      logger.log(`Estratégia '${strategyName}' não encontrada`, "error");
    }
  });

  socket.on("reset_stats", () => {
    resetStats();
  });

  socket.on("clear_digits", () => {
    botState.lastDigits = [];
    logger.log("Dígitos limpos");
    io.emit("botStateUpdate", botState);
  });

  socket.on("get_config", () => {
    socket.emit("configUpdate", config);
  });

  // Relatórios
  socket.on("download_full_log", () => {
    const report = logger.generateFullLogReport();
    socket.emit("downloadFile", {
      filename: `logs_completos_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`,
      content: report,
      type: "text/plain"
    });
  });

  socket.on("download_sequence_report", () => {
    const report = sequenceTracker.generateSequenceReport();
    socket.emit("downloadFile", {
      filename: `relatorio_sequencias_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`,
      content: report,
      type: "text/plain"
    });
  });
});

// =========================
// HELPER FUNCTIONS
// =========================
function handleAPIResponse(response) {
  if (response.error) {
    botState.makingEntry = false;
    logger.log(`Erro API: ${response.error.message}`, "error");
    return;
  }

  if (response.authorize) {
    botState.connected = true;
    derivAPI.sendMessage({ balance: 1, subscribe: 1 });
    derivAPI.sendMessage({ ticks: config.symbol, subscribe: 1 });
    io.emit("botStateUpdate", botState);
    logger.log("Conectado à Deriv API");
  }

  if (response.balance) {
    botState.balance = ensureValidNumber(response.balance.balance, 0);
    
    if (botState.initialBalance === 0) {
      botState.initialBalance = botState.balance;
      logger.log(`Saldo inicial definido: $${botState.initialBalance.toFixed(2)}`);
    }
    
    botState.stats.profit = parseFloat(
        (botState.balance - botState.initialBalance).toFixed(2)
      );

    io.emit("botStateUpdate", botState);
  }

  if (response.proposal) {
    const buyRequest = {
      buy: response.proposal.id,
      price: response.proposal.ask_price
    };
    try {
      derivAPI.sendMessage(buyRequest);
    } catch (err) {
      botState.makingEntry = false;
      logger.log("Erro ao enviar buy", "error");
    }
  }

  if (response.buy) {
    botState.makingEntry = false;
  }

  if (response.tick) {
    handleTick(response.tick);
  }
}

function updateConfig(newConfig) {
  const baseStake = ensureValidNumber(newConfig.baseStake, 0.35);
  const multiplier = ensureValidNumber(newConfig.multiplier, 2.0);
  const maxMartingale = parseInt(newConfig.maxMartingale) || 5;
  const payout = ensureValidNumber(newConfig.payout, 0.95);
  const minEven = parseInt(newConfig.minEven) || 5;
  const minOdd = parseInt(newConfig.minOdd) || 5;
  const profitGoal = ensureValidNumber(newConfig.profitGoal, 0);

  // Validações
  if (baseStake < 0.35) {
    logger.log("Stake inicial deve ser no mínimo $0.35", "error");
    return;
  }
  if (multiplier < 1.1) {
    logger.log("Multiplicador deve ser no mínimo 1.1", "error");
    return;
  }
  if (payout < 0.1 || payout > 5.0) {
    logger.log("Payout deve estar entre 0.1 e 5.0", "error");
    return;
  }

  // Atualizar configurações
  Object.assign(config, {
    baseStake,
    multiplier,
    maxMartingale,
    payout,
    minEven,
    minOdd,
    profitGoal
  });

  // Atualizar estratégia atual
  if (currentStrategy) {
    currentStrategy.updateConfig(config);
  }

  logger.log("Configurações atualizadas com sucesso");
  io.emit("botStateUpdate", botState);
  io.emit("configUpdate", config);
}

function resetStats() {
  botState.stats = { profit: 0, totalTrades: 0, wins: 0, losses: 0, initialBalance:0 };
  botState.makingEntry = false;
  localTrades = {};
  tradeCounter = 0;
  
  // Reset da estratégia atual
  if (currentStrategy) {
    botState.strategyState = currentStrategy.reset();
  }
  
  sequenceTracker.reset();
  
  logger.log("Estatísticas resetadas");
  io.emit("botStateUpdate", botState);
}

// =========================
// START SERVER
// =========================
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});