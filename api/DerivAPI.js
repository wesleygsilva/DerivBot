const WebSocket = require("ws");
const DerivAPIBasic = require("@deriv/deriv-api/dist/DerivAPIBasic");

/**
 * Módulo para comunicação com a API da Deriv usando a biblioteca @deriv/deriv-api
 */
class DerivAPI {
  constructor(logger) {
    this.logger = logger;
    this.ws = null;
    this.api = null; // Instância do @deriv/deriv-api
    this.apiToken = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000;
    this.responseCallback = null;
    this.tickSubscription = null;
    this.balanceSubscription = null;
  }

  /**
   * Conecta à API da Deriv
   */
  connect(token, responseCallback) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.disconnect();
    }

    this.apiToken = token;
    this.responseCallback = responseCallback;
    this.reconnectAttempts = 0;

    this.establishConnection();
  }

  /**
   * Estabelece conexão WebSocket e inicializa o @deriv/deriv-api
   */
  establishConnection() {
    this.logger.log("Tentando conectar à Deriv API...");
    this.ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");
    this.api = new DerivAPIBasic({ connection: this.ws });

    this.ws.on("open", async () => {
      this.logger.logSuccess("Conexão WebSocket estabelecida");
      try {
        const authResponse = await this.api.authorize(this.apiToken);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        if (this.responseCallback) {
          this.responseCallback(authResponse);
        }
      } catch (e) {
        const errorMsg = e.error ? e.error.message : e.message;
        this.logger.logError(`Erro de autorização: ${errorMsg}`, "error");
        if (this.responseCallback) {
          this.responseCallback({ error: { message: errorMsg } });
        }
      }
    });

    this.ws.on("error", (error) => {
      this.logger.logError("Erro na conexão WebSocket", error);
      this.isConnected = false;
    });

    this.ws.on("close", () => {
      this.isConnected = false;
      this.logger.logWarning("Conexão fechada.");
      
      // Limpa subscrições
      if (this.tickSubscription) this.tickSubscription.unsubscribe();
      if (this.balanceSubscription) this.balanceSubscription.unsubscribe();
      this.tickSubscription = null;
      this.balanceSubscription = null;
      
      if (this.reconnectAttempts < this.maxReconnectAttempts && this.apiToken) {
        this.scheduleReconnect();
      } else if (this.apiToken) {
        this.logger.logError("Máximo de tentativas de reconexão atingido.");
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
  }

  /**
   * Roteia mensagens para os métodos corretos do @deriv/deriv-api
   */
  async sendMessage(message) {
    if (!this.api || !this.isConnected) {
      this.logger.logWarning("API não conectada. A chamada foi ignorada.", "warn");
      return;
    }

    try {
      if (message.proposal) {
        const proposalResponse = await this.api.proposal(message);
        this.responseCallback(proposalResponse);
      } else if (message.buy) {
        const buyResponse = await this.api.buy(message);
        this.responseCallback(buyResponse);
      } else if (message.balance) {
        if (this.balanceSubscription) this.balanceSubscription.unsubscribe();
        this.balanceSubscription = this.api.subscribe(message).subscribe(response => {
          this.responseCallback(response);
        });
      } else if (message.ticks) {
        if (this.tickSubscription) this.tickSubscription.unsubscribe();
        this.tickSubscription = this.api.subscribe(message).subscribe(response => {
          this.responseCallback(response);
        });
      } else if (message.forget_all === 'ticks') {
        if (this.tickSubscription) {
          this.tickSubscription.unsubscribe();
          this.tickSubscription = null;
          this.logger.log("Subscrição de ticks cancelada.", "info");
        }
      } else {
        this.logger.log(`Tipo de mensagem não tratada: ${Object.keys(message)[0]}`, 'warn');
      }
    } catch (e) {
      const errorMsg = e.error ? e.error.message : e.message;
      this.logger.logError(`Erro na chamada da API: ${errorMsg}`, "error");
      if (this.responseCallback) {
        this.responseCallback({ error: { message: errorMsg } });
      }
    }
  }

  /**
   * Desconecta da API
   */
  disconnect() {
    if (this.tickSubscription) this.tickSubscription.unsubscribe();
    if (this.balanceSubscription) this.balanceSubscription.unsubscribe();
    if (this.api) this.api.disconnect();
    
    this.ws = null;
    this.api = null;
    this.isConnected = false;
    this.apiToken = null; // Previne reconexão automática ao desconectar manualmente
    this.logger.log("Desconectado da Deriv API");
  }

  /**
   * Verifica se está conectado
   */
  isConnectedToAPI() {
    return this.isConnected && this.api && this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

module.exports = DerivAPI;
