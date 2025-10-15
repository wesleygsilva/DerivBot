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
// CONFIGURAÇÕES INICIAIS
// =========================
let config = {
  strategy: "EvenOddStrategy",
  contract_type: "DIGITODD",
  duration: 1,
  symbol: "R_100",
  baseStake: 0.35,
  multiplier: 2.2,
  maxMartingale: 6,
  payout: 0.95,
  minEven: 3,
  minOdd: 3,
  profitGoal: 0,
  // OverUnder
  waitFor: 'UNDER',
  referenceDigit: 3,
  targetDigit: 2,
  minConsecutive: 3,
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
  strategyState: {},
};

// =========================
// INSTÂNCIAS
// =========================
const logger = new Logger(io);
const sequenceTracker = new SequenceTracker(logger);
const derivAPI = new DerivAPI(logger);

// =========================
// CARREGAR ESTRATÉGIAS
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
// TRADES LOCAIS
// =========================
let localTrades = {};
let tradeCounter = 0;

// =========================
// CONTROLE DE SUBSCRIÇÃO
// =========================
let currentTickSubscription = null;

// =========================
// UTILS
// =========================
function ensureValidNumber(value, defaultValue = 1.0) {
  const num = parseFloat(value);
  return isNaN(num) || num <= 0 ? defaultValue : num;
}

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
// SUBSCRIÇÃO DE TICKS
// =========================
function subscribeToTicks(symbol) {
  if (!botState.connected) {
    logger.log("Não é possível subscrever ticks: não conectado", "error");
    return;
  }

  // Se já houver uma subscrição ativa para um símbolo diferente, cancelar
  if (currentTickSubscription && currentTickSubscription !== symbol) {
    logger.log(`Cancelando subscrição anterior: ${currentTickSubscription}`, "info");
    derivAPI.sendMessage({ forget_all: "ticks" });
  }

  // Subscrever ao novo símbolo
  logger.log(`Subscrevendo aos ticks: ${symbol}`, "info");
  derivAPI.sendMessage({ ticks: symbol, subscribe: 1 });
  currentTickSubscription = symbol;
}

// =========================
// PROCESSAMENTO DE TICKS
// =========================
function handleTick(tick) {
  if (!botState.isRunning) return;

  const quote = Number(tick.quote).toFixed(2);
  const lastDigit = parseInt(quote.replace('.', '').slice(-1));

  botState.lastDigits.push(lastDigit);
  if (botState.lastDigits.length > 20) botState.lastDigits.shift();

  sequenceTracker.updateSequenceStats(lastDigit);
  resolveOpenTrades(lastDigit);

  if (!botState.isRunning) {
    io.emit("botStateUpdate", botState);
    return;
  }

  if (currentStrategy) {
    const decision = currentStrategy.processSignal(lastDigit, botState.strategyState);

    if (decision.shouldTrade) {
      makeEntryAsync(lastDigit, decision.entryType, decision.reason, decision.barrier);
    }
  }

  io.emit("botStateUpdate", botState);
}

function resolveOpenTrades(lastDigit) {
  const tradeIds = Object.keys(localTrades);

  for (const id of tradeIds) {
    const trade = localTrades[id];
    if (trade && trade.status === "open") {
      // Definir o dígito do resultado
      trade.resultDigit = lastDigit;
      
      // MUDANÇA: Delegar validação para a estratégia
      let isWin = false;
      
      if (currentStrategy && typeof currentStrategy.validateTradeResult === 'function') {
        // Estratégia tem método de validação próprio
        isWin = currentStrategy.validateTradeResult(trade);
      } else {
        // Fallback para estratégias sem validação própria (EvenOdd, etc)
        if (trade.entryType === "DIGITODD") isWin = lastDigit % 2 === 1;
        else if (trade.entryType === "DIGITEVEN") isWin = lastDigit % 2 === 0;
        else if (trade.entryType === "DIGITOVER") isWin = lastDigit > trade.barrier;
        else if (trade.entryType === "DIGITUNDER") isWin = lastDigit < trade.barrier;
      }

      trade.status = isWin ? "win" : "loss";

      botState.stats.totalTrades++;
      if (isWin) {
        botState.stats.wins++;
        logger.log(`Trade #${trade.id} (${trade.contract_id}) WIN | Entrada após dígito: ${trade.entryDigit} → Resultado: ${trade.resultDigit}`);
        if (currentStrategy) currentStrategy.onTradeResult(trade, botState.strategyState, true);
        if (checkProfitGoal()) {
          io.emit("tradeResult", trade);
          return;
        }
      } else {
        botState.stats.losses++;
        logger.log(`Trade #${trade.id} (${trade.contract_id}) LOSS | Entrada após dígito: ${trade.entryDigit} → Resultado: ${trade.resultDigit}`, "error");
        if (currentStrategy) {
          const shouldContinue = currentStrategy.onTradeResult(trade, botState.strategyState, false);
          if (!shouldContinue) botState.isRunning = false;
        }
      }

      io.emit("tradeResult", trade);
    }
  }
}

// =========================
// FAZER ENTRADA
// =========================
function makeEntryAsync(lastDigit = null, entryType = "DIGITODD", reason = "", barrier = null) {
  if (!botState.connected || !botState.isRunning) {
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
    barrier: barrier || config.targetDigit,
    status: "open",
    timestamp: Date.now(),
    reason: reason,
    contract_id: null  
  };

  // Construir proposta para Deriv
  const proposalData = {
    proposal: 1,
    amount: stake,
    basis: "stake",
    contract_type: entryType,
    currency: "USD",
    duration: config.duration,
    duration_unit: "t",
    symbol: config.symbol
  };

  // Para DIGITOVER/DIGITUNDER precisamos ajustar conforme o símbolo
  if (entryType.startsWith("DIGITOVER") || entryType.startsWith("DIGITUNDER")) {
    const targetDigit = barrier || config.targetDigit;
    
    // Se o símbolo for 1HZ (1s), usamos barrier separado
    if (config.symbol.startsWith("1HZ")) {
      proposalData.contract_type = entryType.replace(/\d+$/, "");
      proposalData.barrier = targetDigit;
    } else {
      // Para R_ (volatilities normais), o número vai junto no contract_type
      proposalData.contract_type = entryType + targetDigit;
    }
  }

  botState.makingEntry = true;
  try {
    derivAPI.sendMessage(proposalData);
  } catch (error) {
    botState.makingEntry = false;
    logger.log("Erro ao enviar proposta", "error");
  }

  io.emit("tradePending", localTrades[id]);
  logger.log(`Trade #${id} lançado | ${reason} | Entrada ${proposalData.contract_type} após dígito: ${lastDigit} | Stake: ${stake}`);
}

// =========================
// SOCKET.IO
// =========================
io.on("connection", (socket) => {
  socket.emit("botStateUpdate", botState);
  socket.emit("configUpdate", config);

  socket.on("connect_bot", (token) => {
    derivAPI.connect(token, handleAPIResponse);
  });

  socket.on("start_bot", () => {
    if (!botState.connected) {
      logger.log("Não é possível iniciar: não conectado", "error");
      return;
    }
    botState.isRunning = true;
    botState.makingEntry = false;
    if (currentStrategy) botState.strategyState = currentStrategy.reset();
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
    const oldSymbol = config.symbol;
    updateConfig(newConfig);
    
    // Se o símbolo mudou e estamos conectados, re-subscrever
    if (newConfig.symbol && newConfig.symbol !== oldSymbol && botState.connected) {
      logger.log(`Símbolo alterado: ${oldSymbol} → ${config.symbol}`, "info");
      subscribeToTicks(config.symbol);
      
      // Limpar dígitos ao trocar de símbolo
      botState.lastDigits = [];
      io.emit("botStateUpdate", botState);
    }
  });

  socket.on("change_strategy", (strategyName) => {
    if (strategies[strategyName]) {
      config.strategy = strategyName;
      currentStrategy = strategies[strategyName];
      currentStrategy.updateConfig(config);
      botState.strategyState = currentStrategy.reset();
      logger.log(`Estratégia alterada para: ${currentStrategy.name}`);
      socket.emit("currentStrategyInfo", {
        name: currentStrategy.name,
        description: getStrategyDescription(strategyName),
        schema: currentStrategy.getConfigSchema()
      });
      io.emit("configUpdate", config);
      io.emit("botStateUpdate", botState);
    }
  });

  socket.on("get_strategies", () => {
    const info = {};
    Object.keys(strategies).forEach(key => {
      info[key] = {
        name: strategies[key].name,
        description: getStrategyDescription(key)
      };
    });
    socket.emit("strategiesUpdate", info);
    if (currentStrategy) {
      socket.emit("currentStrategyInfo", {
        name: currentStrategy.name,
        description: getStrategyDescription(config.strategy),
        schema: currentStrategy.getConfigSchema()
      });
    }
  });

  socket.on("reset_stats", resetStats);

  socket.on("clear_digits", () => {
    botState.lastDigits = [];
    logger.log("Dígitos limpos");
    io.emit("botStateUpdate", botState);
  });

  socket.on("get_config", () => {
    socket.emit("configUpdate", config);
  });

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
// FUNÇÕES AUXILIARES
// =========================
function getStrategyDescription(strategyName) {
  const desc = {
    EvenOddStrategy: "Aguarda sequências de dígitos pares/ímpares para fazer entrada no oposto",
    OverUnderStrategy: "Aguarda sequências de dígitos OVER/UNDER um valor específico para fazer entrada"
  };
  return desc[strategyName] || "Estratégia de trading automatizado";
}

function handleAPIResponse(response) {
  if (response.error) {
    botState.makingEntry = false;
    logger.log(`Erro API: ${response.error.message}`, "error");
    return;
  }

  if (response.authorize) {
    botState.connected = true;
    derivAPI.sendMessage({ balance: 1, subscribe: 1 });
    subscribeToTicks(config.symbol);
    io.emit("botStateUpdate", botState);
    logger.log("Conectado à Deriv API");
  }

  if (response.balance) {
    botState.balance = ensureValidNumber(response.balance.balance, 0);
    if (botState.initialBalance === 0) botState.initialBalance = botState.balance;
    botState.stats.profit = parseFloat((botState.balance - botState.initialBalance).toFixed(2));
    io.emit("botStateUpdate", botState);
  }

  if (response.proposal) {
    derivAPI.sendMessage({ buy: response.proposal.id, price: response.proposal.ask_price });
  }

  if (response.buy) {
    botState.makingEntry = false;
    
    // Pegar o contract_id da COMPRA (não da venda)
    const openTrades = Object.values(localTrades).filter(t => t.status === "open");
    if (openTrades.length > 0) {
      const lastTrade = openTrades[openTrades.length - 1];
      lastTrade.contract_id = response.buy.contract_id;  // ID da compra
      lastTrade.purchase_time = response.buy.purchase_time;  // Opcional: timestamp
      logger.log(`Contract ID: ${response.buy.contract_id} vinculado ao Trade #${lastTrade.id}`);
    }
  }

  if (response.tick) {
    handleTick(response.tick);
  }
}

function updateConfig(newConfig) {
  Object.assign(config, newConfig);
  if (currentStrategy) currentStrategy.updateConfig(config);
  logger.log("Configurações atualizadas");
  io.emit("botStateUpdate", botState);
  io.emit("configUpdate", config);
}

function resetStats() {
  botState.stats = { profit: 0, totalTrades: 0, wins: 0, losses: 0 };
  botState.makingEntry = false;
  localTrades = {};
  tradeCounter = 0;
  if (currentStrategy) botState.strategyState = currentStrategy.reset();
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