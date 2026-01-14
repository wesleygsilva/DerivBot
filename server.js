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
// TOKEN PARA AUTO-CONEXÃO
// =========================
const AUTO_CONNECT_TOKEN = "NSZPzUBXPi37dnV"; // Token provisório

// =========================
// CONFIGURAÇÕES INICIAIS
// =========================
let config = {
  strategy: "ParityAI",
  riskMode: "Conservador", // Um modo de risco padrão
  contract_type: "DIGITODD",
  duration: 1,
  symbol: "R_100",
  baseStake: 0.35,
  multiplier: 2.2, // O multiplicador será definido pelo riskMode da estratégia
  maxMartingale: 6,
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
// AUTO-CONEXÃO À DERIV API
// =========================
derivAPI.connect(AUTO_CONNECT_TOKEN, handleAPIResponse);
logger.log("Tentando auto-conectar à Deriv API...");

// =========================
// UTILS
// =========================
function getTickDurationInSeconds(symbol) {
  // Symbols com '1HZ' têm ticks de 1 segundo, os outros padrões (R_XX) são de 2 segundos.
  return symbol.includes('1HZ') ? 1 : 2;
}

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

  if (currentTickSubscription && currentTickSubscription !== symbol) {
    logger.log(`Cancelando subscrição anterior: ${currentTickSubscription}`, "info");
    derivAPI.sendMessage({ forget_all: "ticks" });
  }

  logger.log(`Subscrevendo aos ticks: ${symbol}`, "info");
  derivAPI.sendMessage({ ticks: symbol, subscribe: 1 });
  currentTickSubscription = symbol;
}

// =========================
// PROCESSAMENTO DE TICKS
// =========================
function handleTick(tick) {
  const quote = Number(tick.quote).toFixed(2);
  const lastDigit = parseInt(quote.replace('.', '').slice(-1));

  botState.lastDigits.push(lastDigit);
  if (botState.lastDigits.length > 20) botState.lastDigits.shift();

  sequenceTracker.updateSequenceStats(lastDigit);
  
  resolveOpenTrades(tick);
  
  const hasOpenTrade = Object.values(localTrades).some(t => t.status === 'sent' || t.status === 'open');

  if (botState.isRunning && !hasOpenTrade) {
    if (currentStrategy) {
      const decision = currentStrategy.processSignal(lastDigit, botState.strategyState);

      if (decision.shouldTrade) {
        makeEntryAsync(lastDigit, decision);
      }
    }
  }

  io.emit("botStateUpdate", botState);
}

function resolveOpenTrades(tick) {
  const lastDigit = parseInt(Number(tick.quote).toFixed(2).replace('.', '').slice(-1));

  for (const id of Object.keys(localTrades)) {
    const trade = localTrades[id];
    
    if (trade && trade.status === "open" && tick.epoch >= trade.expiry_time) {
      trade.resultDigit = lastDigit;
      trade.status = 'closed';
      
      let isWin = false;
      if (currentStrategy && typeof currentStrategy.validateTradeResult === 'function') {
        isWin = currentStrategy.validateTradeResult(trade);
      } else {
        if (trade.entryType === "DIGITODD") isWin = lastDigit % 2 === 1;
        else if (trade.entryType === "DIGITEVEN") isWin = lastDigit % 2 === 0;
        else if (trade.entryType === "DIGITOVER") isWin = lastDigit > trade.barrier;
        else if (trade.entryType === "DIGITUNDER") isWin = lastDigit < trade.barrier;
      }
      
      const stake = trade.stake;
      const tradePayout = trade.payout; // Usa o payout armazenado no trade
      const profit = isWin ? (stake * tradePayout) : -stake;
      
      botState.stats.totalTrades++;
      botState.stats.profit = parseFloat((botState.stats.profit + profit).toFixed(2));
      botState.balance = parseFloat((botState.balance + profit).toFixed(2));

      if (isWin) {
        botState.stats.wins++;
        logger.log(`Trade #${trade.id} WIN | Saída: ${trade.resultDigit} | Lucro: ${profit.toFixed(2)}`);
        if (currentStrategy) currentStrategy.onTradeResult(trade, botState.strategyState, true);
      } else {
        botState.stats.losses++;
        logger.log(`Trade #${trade.id} LOSS | Saída: ${trade.resultDigit} | Prejuízo: ${profit.toFixed(2)}`, "error");
        if (currentStrategy) {
          const shouldContinue = currentStrategy.onTradeResult(trade, botState.strategyState, false);
          if (!shouldContinue) botState.isRunning = false;
        }
      }

      io.emit("tradeResult", trade);
      delete localTrades[id];
      
      if (checkProfitGoal()) return;
    }
  }
}

// =========================
// FAZER ENTRADA
// =========================
function makeEntryAsync(lastDigit = null, decision) {
  if (!botState.connected || !botState.isRunning || botState.makingEntry) {
    return;
  }

  botState.makingEntry = true;

  const { entryType, reason, barrier, payout } = decision;

  const rawStake = currentStrategy ? currentStrategy.getCurrentStake(botState.strategyState) : config.baseStake;
  const stake = parseFloat(Number(rawStake).toFixed(2));

  if (stake > botState.balance) {
    botState.isRunning = false;
    botState.makingEntry = false;
    logger.log("Saldo insuficiente. Bot parado.", "error");
    io.emit("botStateUpdate", botState);
    return;
  }

  const proposalData = {
    proposal: 1,
    amount: stake,
    basis: "stake",
    contract_type: entryType,
    currency: "USD",
    duration: config.duration,
    duration_unit: "t",
    symbol: config.symbol,
  };

  if (entryType.startsWith("DIGITOVER") || entryType.startsWith("DIGITUNDER")) {
    const targetDigit = barrier || config.targetDigit;
    proposalData.contract_type = entryType.replace(/\d+$/, "");
    proposalData.barrier = targetDigit;
  }
  
  const id = ++tradeCounter;

  localTrades[id] = {
    id,
    stake: stake,
    entryDigit: lastDigit,
    entryType: proposalData.contract_type,
    barrier: proposalData.barrier,
    status: "sent",
    timestamp: Date.now(),
    reason: reason,
    contract_id: null,
    expiry_time: 0,
    payout: payout, // Armazena o payout da decisão da estratégia
  };

  try {
    derivAPI.sendMessage(proposalData);
  } catch (error) {
    botState.makingEntry = false;
    logger.log("Erro ao enviar proposta", "error");
    delete localTrades[id];
  }

  io.emit("tradePending", localTrades[id]);
  logger.log(`Trade #${id} lançado | ${reason} | Stake: ${stake}`);
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
    
    if (newConfig.symbol && newConfig.symbol !== oldSymbol && botState.connected) {
      logger.log(`Símbolo alterado: ${oldSymbol} → ${config.symbol}`, "info");
      subscribeToTicks(config.symbol);
      botState.lastDigits = [];
      io.emit("botStateUpdate", botState);
    }
  });

  socket.on("change_strategy", (strategyName) => {
    if (strategies[strategyName]) {
      config.strategy = strategyName;
      currentStrategy = strategies[strategyName];
      
      // Atualiza os modos de risco e o multiplicador padrão para a nova estratégia
      let riskModes = {};
      if (typeof currentStrategy.getRiskModes === 'function') {
        riskModes = currentStrategy.getRiskModes();
        const defaultRiskMode = Object.keys(riskModes)[0] || "Conservador";
        config.riskMode = defaultRiskMode;
        config.multiplier = riskModes[defaultRiskMode] || 2.2;
      }
      socket.emit("riskModesUpdate", riskModes);
      
      currentStrategy.updateConfig(config);
      botState.strategyState = currentStrategy.reset();
      logger.log(`Estratégia alterada para: ${currentStrategy.name}`);
      
      socket.emit("currentStrategyInfo", {
        name: currentStrategy.name,
        description: getStrategyDescription(strategyName),
        schema: currentStrategy.getConfigSchema(),
        tradingModes: typeof currentStrategy.getTradingModes === 'function' ? currentStrategy.getTradingModes() : {}
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

    // Envia os modos de risco da estratégia atual
    let riskModes = {};
    if (currentStrategy && typeof currentStrategy.getRiskModes === 'function') {
        riskModes = currentStrategy.getRiskModes();
    }
    socket.emit("riskModesUpdate", riskModes);

    if (currentStrategy) {
      socket.emit("currentStrategyInfo", {
        name: currentStrategy.name,
        description: getStrategyDescription(config.strategy),
        schema: currentStrategy.getConfigSchema(),
        tradingModes: typeof currentStrategy.getTradingModes === 'function' ? currentStrategy.getTradingModes() : {}
      });
    }
  });

  socket.on("reset_stats", resetStats);
  socket.on("clear_digits", () => {
    botState.lastDigits = [];
    logger.log("Dígitos limpos");
    io.emit("botStateUpdate", botState);
  });
  socket.on("get_config", () => { socket.emit("configUpdate", config); });
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
    ParityAI: "Aguarda sequências de dígitos pares/ímpares para fazer entrada no oposto",
    GladiatorAI: "Estratégia Gladiator AI, aguarda sequências de dígitos OVER/UNDER para fazer entrada",
    ZeusAI: "Entra sempre over 3. A espera para reentrar após uma perda é definida pelos modos de negociação."
  };
  return desc[strategyName] || "";
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
    io.emit("botStateUpdate", botState);
  }

  if (response.proposal) {
    const trade = Object.values(localTrades).find(t => t.status === 'sent');
    if (trade) {
      derivAPI.sendMessage({ buy: response.proposal.id, price: response.proposal.ask_price });
    } else {
      logger.log("Proposta recebida sem um trade local correspondente.", "warning");
    }
  }

  if (response.buy) {
    const contractId = response.buy.contract_id;
    const trade = Object.values(localTrades).find(t => t.status === 'sent' && !t.contract_id);
    
    if (trade) {
      trade.contract_id = contractId;
      trade.status = 'open';
      
      const tickDurationInSeconds = getTickDurationInSeconds(config.symbol);
      trade.expiry_time = response.buy.purchase_time + (config.duration * tickDurationInSeconds);
      logger.log(`Contract ID: ${contractId} vinculado ao Trade #${trade.id}. Apuração estimada no tempo: ${trade.expiry_time}`);
    } else {
      logger.log(`Compra recebida para contract_id ${contractId} mas não foi encontrado trade local.`, "warning");
    }
    
    botState.makingEntry = false;
  }

  if (response.tick) {
    handleTick(response.tick);
  }
}

function updateConfig(newConfig) {
  // Primeiro, mescla a configuração recebida para atualizar o riskMode, se houver.
  Object.assign(config, newConfig);

  // Agora, com base no riskMode (potencialmente novo), define o multiplicador correto.
  // Isso garante que o multiplicador do modo de risco tenha prioridade.
  if (config.riskMode && currentStrategy && typeof currentStrategy.getRiskModes === 'function') {
    const riskModes = currentStrategy.getRiskModes();
    if (riskModes[config.riskMode]) {
      config.multiplier = riskModes[config.riskMode];
    }
  }

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
