const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

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
  contract_type: "DIGITODD",
  duration: 1,
  symbol: "1HZ10V",
  baseStake: 0.35,
  multiplier: 2.2,
  maxMartingale: 8,
  payout: 0.95,
  minPairs: 6,
  minImpares: 6,
  profitGoal: 0,  // Meta de lucro (0 = desabilitado)
};

// =========================
// ESTADO DO BOT
// =========================
let botState = {
  connected: false,
  isRunning: false,
  makingEntry: false,
  lastDigits: [],
  waitingForPairs: 0,
  waitingForImpares: 0,
  martingaleCount: 0,
  currentStake: config.baseStake,
  balance: 0,
  stats: { profit: 0, totalTrades: 0, wins: 0, losses: 0 },
};

// =========================
// CONTROLE DE TRADES
// =========================
let localTrades = {};
let tradeCounter = 0;

// =========================
// LOGS
// =========================
let systemLogs = []; // Array para armazenar todos os logs

function log(message, type = "info") {
  const logObj = {
    message,
    type,
    category: "general",
    timestamp: new Date().toLocaleTimeString(),
    fullTimestamp: new Date().toISOString(),
  };
  
  // Armazenar no array de logs
  systemLogs.push(logObj);
  
  // Manter apenas os últimos 1000 logs na memória
  if (systemLogs.length > 1000) {
    systemLogs.shift();
  }
  
  console.log(`[${type.toUpperCase()}] ${message}`);
  io.emit("newLog", logObj);
}

// =========================
// RASTREAMENTO DE SEQUÊNCIAS
// =========================
let sequenceStats = {
  pares: {}, // {2: 4, 3: 2, 4: 1} significa: 2 pares consecutivos aconteceu 4 vezes
  impares: {},
  currentParesSequence: 0,
  currentImparesSequence: 0
};

function updateSequenceStats(digit) {
  const isEven = digit % 2 === 0;
  
  if (isEven) {
    // Se for par
    sequenceStats.currentParesSequence++;
    
    // Se tinha sequência de ímpares, finaliza e conta
    if (sequenceStats.currentImparesSequence > 0) {
      const count = sequenceStats.currentImparesSequence;
      sequenceStats.impares[count] = (sequenceStats.impares[count] || 0) + 1;
      log(`Sequência de ${count} ímpares finalizada. Total registrado: ${sequenceStats.impares[count]} vezes`);
      sequenceStats.currentImparesSequence = 0;
    }
  } else {
    // Se for ímpar
    sequenceStats.currentImparesSequence++;
    
    // Se tinha sequência de pares, finaliza e conta
    if (sequenceStats.currentParesSequence > 0) {
      const count = sequenceStats.currentParesSequence;
      sequenceStats.pares[count] = (sequenceStats.pares[count] || 0) + 1;
      log(`Sequência de ${count} pares finalizada. Total registrado: ${sequenceStats.pares[count]} vezes`);
      sequenceStats.currentParesSequence = 0;
    }
  }
}

function generateSequenceReport() {
  let report = "=== RELATÓRIO DE SEQUÊNCIAS ===\n";
  report += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n\n`;
  
  report += "SEQUÊNCIAS DE DÍGITOS PARES:\n";
  const paresKeys = Object.keys(sequenceStats.pares).sort((a, b) => parseInt(a) - parseInt(b));
  if (paresKeys.length === 0) {
    report += "Nenhuma sequência de pares registrada ainda.\n";
  } else {
    paresKeys.forEach(length => {
      report += `${length} pares consecutivos: ${sequenceStats.pares[length]} vezes\n`;
    });
  }
  
  report += "\nSEQUÊNCIAS DE DÍGITOS ÍMPARES:\n";
  const imparesKeys = Object.keys(sequenceStats.impares).sort((a, b) => parseInt(a) - parseInt(b));
  if (imparesKeys.length === 0) {
    report += "Nenhuma sequência de ímpares registrada ainda.\n";
  } else {
    imparesKeys.forEach(length => {
      report += `${length} ímpares consecutivos: ${sequenceStats.impares[length]} vezes\n`;
    });
  }
  
  report += "\nSEQUÊNCIAS ATUAIS EM ANDAMENTO:\n";
  if (sequenceStats.currentParesSequence > 0) {
    report += `Pares em andamento: ${sequenceStats.currentParesSequence} consecutivos\n`;
  }
  if (sequenceStats.currentImparesSequence > 0) {
    report += `Ímpares em andamento: ${sequenceStats.currentImparesSequence} consecutivos\n`;
  }
  if (sequenceStats.currentParesSequence === 0 && sequenceStats.currentImparesSequence === 0) {
    report += "Nenhuma sequência em andamento no momento.\n";
  }
  
  return report;
}

function generateFullLogReport() {
  let report = "=== RELATÓRIO COMPLETO DE LOGS ===\n";
  report += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;
  report += `Total de logs: ${systemLogs.length}\n\n`;
  
  systemLogs.forEach(logEntry => {
    const timestamp = new Date(logEntry.fullTimestamp).toLocaleString('pt-BR');
    report += `[${logEntry.type.toUpperCase()}] ${timestamp} - ${logEntry.message}\n`;
  });
  
  return report;
}

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
    log(`🎯 Meta de lucro atingida! Lucro atual: $${botState.stats.profit.toFixed(2)} | Meta: $${config.profitGoal.toFixed(2)}`, "success");
    io.emit("botStateUpdate", botState);
    return true;
  }
  return false;
}

// =========================
// CONEXÃO COM DERIV
// =========================
let ws = null;
let apiToken = null;

function connectToDerivAPI(token) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.close();

  ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");

  ws.on("open", () => {
    ws.send(JSON.stringify({ authorize: token }));
  });

  ws.on("message", (data) => {
    try {
      const response = JSON.parse(data);
      handleAPIResponse(response);
    } catch (error) {}
  });

  ws.on("error", () => {
    botState.connected = false;
  });

  ws.on("close", () => {
    botState.connected = false;
    io.emit("botStateUpdate", botState);
  });
}

// =========================
// HANDLER DA API
// =========================
function handleAPIResponse(response) {
  if (response.error) {
    botState.makingEntry = false;
    log(`Erro API: ${response.error.message}`, "error");
    return;
  }

  if (response.authorize) {
    botState.connected = true;
    ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
    ws.send(JSON.stringify({ ticks: config.symbol, subscribe: 1 }));
    io.emit("botStateUpdate", botState);
    log("Conectado à Deriv API");
  }

  if (response.balance) {
    botState.balance = ensureValidNumber(response.balance.balance, 0);
    io.emit("botStateUpdate", botState);
  }

  // Recebe proposta, compra automaticamente
  if (response.proposal) {
    const buyRequest = {
      buy: response.proposal.id,
      price: response.proposal.ask_price
    };
    try {
      ws.send(JSON.stringify(buyRequest));
    } catch (err) {
      botState.makingEntry = false;
      log("Erro ao enviar buy", "error");
    }
  }

  // Confirmação de contrato comprado
  if (response.buy) {
    const tradeId = response.buy.contract_id || tradeCounter;
    const stake = response.buy.buy_price || botState.currentStake;

    // log(`Trade confirmado #${tradeId} | Stake: ${stake}`);
    botState.makingEntry = false;
  }

  if (response.tick) {
    handleTick(response.tick);
  }
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
  updateSequenceStats(lastDigit);

  // Resolver trades abertos
  for (let id in localTrades) {
    const trade = localTrades[id];
    if (trade.status === "open") {
      const isWin = (trade.entryType === "DIGITODD") ? lastDigit % 2 === 1 : lastDigit % 2 === 0;
      const profit = isWin ? trade.stake * config.payout : -trade.stake;

      trade.resultDigit = lastDigit;
      trade.profit = profit;
      trade.status = isWin ? "win" : "loss";

      botState.stats.totalTrades++;
      botState.stats.profit += profit;

      if (isWin) {
        botState.stats.wins++;
        botState.martingaleCount = 0;
        botState.currentStake = config.baseStake;
        log(`Trade #${trade.id} WIN | Entrada: ${trade.entryDigit} → Resultado: ${trade.resultDigit} | +${profit.toFixed(2)}`);
        
        // Verificar meta de lucro após win
        if (checkProfitGoal()) {
          io.emit("tradeResult", trade);
          return;
        }
      } else {
        botState.stats.losses++;
        if (botState.martingaleCount < config.maxMartingale) {
          botState.martingaleCount++;
          botState.currentStake *= config.multiplier;
          botState.currentStake = parseFloat(botState.currentStake.toFixed(2));
          log(`Trade #${trade.id} LOSS | Entrada: ${trade.entryDigit} → Resultado: ${trade.resultDigit} | ${profit.toFixed(2)} | Gale ${botState.martingaleCount}/${config.maxMartingale}`, "warning");
        } else {
          botState.martingaleCount = 0;
          botState.currentStake = config.baseStake;
          botState.isRunning = false;
          log(`⚠️ Gale máximo atingido. Bot parado. Revise a estratégia ou reinicie.`, "warning");
        }
      }
      io.emit("tradeResult", trade);
    }
  }

  // Estratégia: entrada ímpar após pares consecutivos
  if (lastDigit % 2 === 0) {
    botState.waitingForPairs++;
    botState.waitingForImpares = 0;
    log(`Digit par detectado (${botState.waitingForPairs}/${config.minPairs})`);

    if (botState.waitingForPairs >= config.minPares || botState.martingaleCount > 0) {
      makeEntryAsync(lastDigit, "DIGITODD");
      botState.waitingForPairs = 0;
    }
  }
  // Estratégia: entrada par após ímpares consecutivos
  else {
    botState.waitingForImpares++;
    botState.waitingForPairs = 0;
    log(`Digit ímpar detectado (${botState.waitingForImpares}/${config.minImpares})`);

    if (botState.waitingForImpares >= config.minImpares || botState.martingaleCount > 0) {
      makeEntryAsync(lastDigit, "DIGITEVEN");
      botState.waitingForImpares = 0;
    }
  }

  io.emit("botStateUpdate", botState);
}

// =========================
// FAZER ENTRADA
// =========================
function makeEntryAsync(lastDigit = null, entryType = "DIGITODD") {
  if (!botState.connected) return;

  botState.currentStake = parseFloat(ensureValidNumber(botState.currentStake, config.baseStake).toFixed(2));
  if (botState.currentStake > botState.balance) {
    botState.isRunning = false;
    log("⚠️ Saldo insuficiente. Bot parado.", "warning");
    return;
  }

  const id = ++tradeCounter;
  localTrades[id] = {
    id,
    stake: botState.currentStake,
    entryDigit: lastDigit,
    entryType,
    status: "open",
    timestamp: Date.now()
  };

  const proposalRequest = {
    proposal: 1,
    amount: botState.currentStake,
    basis: "stake",
    contract_type: entryType,
    currency: "USD",
    duration: config.duration,
    duration_unit: "t",
    symbol: config.symbol
  };

  botState.makingEntry = true;
  try {
    ws.send(JSON.stringify(proposalRequest));
  } catch (error) {
    botState.makingEntry = false;
  }

  io.emit("tradePending", localTrades[id]);
  log(`Trade #${id} lançado | Entrada ${entryType} no dígito: ${lastDigit} | Stake: ${botState.currentStake}`);
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
    apiToken = token;
    connectToDerivAPI(apiToken);
  });

  socket.on("start_bot", () => {
    if (!botState.connected) return;
    botState.isRunning = true;
    botState.waitingForPairs = 0;
    botState.waitingForImpares = 0;
    botState.makingEntry = false;
    botState.currentStake = ensureValidNumber(botState.currentStake, config.baseStake);
    log("Bot iniciado");
    io.emit("botStateUpdate", botState);
  });

  socket.on("stop_bot", () => {
    botState.isRunning = false;
    botState.makingEntry = false;
    log("Bot parado", "warning");
    io.emit("botStateUpdate", botState);
  });

  socket.on("update_config", (newConfig) => {
    const baseStake = ensureValidNumber(newConfig.baseStake, 0.35);
    const multiplier = ensureValidNumber(newConfig.multiplier, 2.0);
    const maxMartingale = parseInt(newConfig.maxMartingale) || 5;
    const payout = ensureValidNumber(newConfig.payout, 0.95);
    const minPairs = parseInt(newConfig.minPairs) || 5;
    const minImpares = parseInt(newConfig.minImpares) || 5;
    const profitGoal = ensureValidNumber(newConfig.profitGoal, 0);

    // Validações
    if (baseStake < 0.35) {
      log("Stake inicial deve ser no mínimo $0.35", "error");
      return;
    }
    if (multiplier < 1.1) {
      log("Multiplicador deve ser no mínimo 1.1", "error");
      return;
    }
    if (payout < 0.1 || payout > 5.0) {
      log("Payout deve estar entre 0.1 e 5.0", "error");
      return;
    }
    if (minPairs < 1 || minPairs > 20) {
      log("Mínimo de pares deve estar entre 1 e 20", "error");
      return;
    }
    if (minImpares < 1 || minImpares > 20) {
      log("Mínimo de ímpares deve estar entre 1 e 20", "error");
      return;
    }

    // Atualizar configurações
    config.baseStake = baseStake;
    config.multiplier = multiplier;
    config.maxMartingale = maxMartingale;
    config.payout = payout;
    config.minPairs = minPairs;
    config.minImpares = minImpares;
    config.profitGoal = profitGoal;

    // Reset do stake atual se não estiver em martingale
    if (botState.martingaleCount === 0) {
      botState.currentStake = config.baseStake;
    }

    log("Configurações atualizadas com sucesso");
    io.emit("botStateUpdate", botState);
    io.emit("configUpdate", config);
  });

  socket.on("reset_stats", () => {
    botState.stats = { profit: 0, totalTrades: 0, wins: 0, losses: 0 };
    botState.martingaleCount = 0;
    botState.currentStake = config.baseStake;
    botState.waitingForPairs = 0;
    botState.waitingForImpares = 0;
    botState.makingEntry = false;
    localTrades = {};
    tradeCounter = 0;
    
    // Resetar também as estatísticas de sequência
    sequenceStats = {
      pares: {},
      impares: {},
      currentParesSequence: 0,
      currentImparesSequence: 0
    };
    
    log("Estatísticas resetadas");
    io.emit("botStateUpdate", botState);
  });

  socket.on("clear_digits", () => {
    botState.lastDigits = [];
    log("Dígitos limpos");
    io.emit("botStateUpdate", botState);
  });

  socket.on("get_config", () => {
    socket.emit("configUpdate", config);
  });

  // Novos eventos para download de relatórios
  socket.on("download_full_log", () => {
    const report = generateFullLogReport();
    socket.emit("downloadFile", {
      filename: `logs_completos_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`,
      content: report,
      type: "text/plain"
    });
  });

  socket.on("download_sequence_report", () => {
    const report = generateSequenceReport();
    socket.emit("downloadFile", {
      filename: `relatorio_sequencias_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`,
      content: report,
      type: "text/plain"
    });
  });
});

// =========================
// START SERVER
// =========================
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});