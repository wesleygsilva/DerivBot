/**
 * Módulo para comunicação com a API da Deriv
 * Centraliza toda a lógica de WebSocket e comunicação
 */

const WebSocket = require("ws");

class DerivAPI {
  constructor(logger) {
    this.logger = logger;
    this.ws = null;
    this.apiToken = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000; // 5 segundos
    this.messageQueue = []; // Fila de mensagens para enviar quando conectar
    this.responseCallback = null;
  }

  /**
   * Conecta à API da Deriv
   */
  connect(token, responseCallback) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.disconnect();
    }

    this.apiToken = token;
    this.responseCallback = responseCallback;
    this.reconnectAttempts = 0;

    this.establishConnection();
  }

  /**
   * Estabelece conexão WebSocket
   */
  establishConnection() {
    this.logger.log("Tentando conectar à Deriv API...");

    this.ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");

    this.ws.on("open", () => {
      this.logger.logSuccess("Conexão WebSocket estabelecida");
      this.reconnectAttempts = 0;
      
      // Autorizar automaticamente
      this.sendMessage({ authorize: this.apiToken });
    });

    this.ws.on("message", (data) => {
      try {
        const response = JSON.parse(data);
        this.handleMessage(response);
      } catch (error) {
        this.logger.logError("Erro ao processar mensagem da API", error);
      }
    });

    this.ws.on("error", (error) => {
      this.logger.logError("Erro na conexão WebSocket", error);
      this.isConnected = false;
    });

    this.ws.on("close", (code, reason) => {
      this.isConnected = false;
      this.logger.logWarning(`Conexão fechada - Código: ${code}, Razão: ${reason}`);
      
      // Tentar reconectar automaticamente
      if (this.reconnectAttempts < this.maxReconnectAttempts && this.apiToken) {
        this.scheduleReconnect();
      } else {
        this.logger.logError("Máximo de tentativas de reconexão atingido");
      }
    });
  }

  /**
   * Agenda uma tentativa de reconexão
   */
  scheduleReconnect() {
    this.reconnectAttempts++;
    this.logger.log(`Tentativa de reconexão ${this.reconnectAttempts}/${this.maxReconnectAttempts} em ${this.reconnectDelay/1000}s`);

    setTimeout(() => {
      if (!this.isConnected) {
        this.establishConnection();
      }
    }, this.reconnectDelay);

    // Aumenta o delay para próximas tentativas
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000); // Máximo 30s
  }

  /**
   * Processa mensagens recebidas da API
   */
  handleMessage(response) {
    // Log de debugging (pode ser removido em produção)
    if (response.error) {
      this.logger.logError(`Erro da API: ${response.error.message}`);
    }

    // Processar autorização
    if (response.authorize) {
      this.isConnected = true;
      this.logger.logSuccess("Autorização bem-sucedida na Deriv API");
      
      // Processar fila de mensagens pendentes
      this.processMessageQueue();
    }

    // Repassar resposta para o callback principal
    if (this.responseCallback) {
      this.responseCallback(response);
    }
  }

  /**
   * Envia mensagem para a API
   */
  sendMessage(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Adicionar à fila se não estiver conectado
      this.messageQueue.push(message);
      this.logger.logWarning("Mensagem adicionada à fila (não conectado)");
      return false;
    }

    try {
      const messageStr = JSON.stringify(message);
      this.ws.send(messageStr);
      
      // Log apenas para mensagens importantes
      if (message.proposal || message.buy || message.balance || message.ticks) {
        // this.logger.log(`Mensagem enviada: ${this.getMessageType(message)}`);
      }
      
      return true;
    } catch (error) {
      this.logger.logError("Erro ao enviar mensagem", error);
      return false;
    }
  }

  /**
   * Processa fila de mensagens pendentes
   */
  processMessageQueue() {
    if (this.messageQueue.length > 0) {
      this.logger.log(`Processando ${this.messageQueue.length} mensagens da fila`);
      
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift();
        this.sendMessage(message);
      }
    }
  }

  /**
   * Retorna tipo da mensagem para logs
   */
  getMessageType(message) {
    if (message.authorize) return "AUTHORIZE";
    if (message.proposal) return "PROPOSAL";
    if (message.buy) return "BUY";
    if (message.balance) return "BALANCE";
    if (message.ticks) return "TICKS_SUBSCRIPTION";
    return "OTHER";
  }

  /**
   * Desconecta da API
   */
  disconnect() {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    this.apiToken = null;
    this.messageQueue = [];
    this.logger.log("Desconectado da Deriv API");
  }

  /**
   * Verifica se está conectado
   */
  isConnectedToAPI() {
    return this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Retorna estatísticas da conexão
   */
  getConnectionStats() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length,
      wsState: this.ws ? this.ws.readyState : null,
      wsStateText: this.getWebSocketStateText()
    };
  }

  /**
   * Retorna texto descritivo do estado do WebSocket
   */
  getWebSocketStateText() {
    if (!this.ws) return "Não conectado";
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return "Conectando";
      case WebSocket.OPEN: return "Conectado";
      case WebSocket.CLOSING: return "Fechando";
      case WebSocket.CLOSED: return "Fechado";
      default: return "Desconhecido";
    }
  }

  /**
   * Força reconexão imediata
   */
  forceReconnect() {
    this.logger.log("Forçando reconexão...");
    this.disconnect();
    
    if (this.apiToken) {
      setTimeout(() => {
        this.establishConnection();
      }, 1000);
    }
  }

  /**
   * Envia ping para manter conexão viva
   */
  ping() {
    if (this.isConnectedToAPI()) {
      this.sendMessage({ ping: 1 });
    }
  }

  /**
   * Inicia ping automático para manter conexão
   */
  startKeepAlive(interval = 30000) { // 30 segundos
    this.keepAliveInterval = setInterval(() => {
      this.ping();
    }, interval);
    
    this.logger.log(`Keep-alive iniciado (${interval/1000}s)`);
  }

  /**
   * Para ping automático
   */
  stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
      this.logger.log("Keep-alive parado");
    }
  }

  /**
   * Subscreve para receber ticks de um símbolo
   */
  subscribeTicks(symbol) {
    return this.sendMessage({ ticks: symbol, subscribe: 1 });
  }

  /**
   * Cancela subscrição de ticks
   */
  unsubscribeTicks(subscriptionId) {
    return this.sendMessage({ forget: subscriptionId });
  }

  /**
   * Subscreve para receber balance
   */
  subscribeBalance() {
    return this.sendMessage({ balance: 1, subscribe: 1 });
  }

  /**
   * Cria proposta de trade
   */
  createProposal(params) {
    const proposalRequest = {
      proposal: 1,
      amount: params.amount,
      basis: params.basis || "stake",
      contract_type: params.contract_type,
      currency: params.currency || "USD",
      duration: params.duration,
      duration_unit: params.duration_unit || "t",
      symbol: params.symbol
    };

    return this.sendMessage(proposalRequest);
  }

  /**
   * Compra um contrato
   */
  buyContract(proposalId, price) {
    return this.sendMessage({
      buy: proposalId,
      price: price
    });
  }

  /**
   * Obtém histórico de ticks
   */
  getTickHistory(symbol, count = 1000) {
    return this.sendMessage({
      ticks_history: symbol,
      count: count,
      end: "latest"
    });
  }
}

module.exports = DerivAPI;