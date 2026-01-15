/**
 * Estratégia ZeusAI
 * 
 * Lógica: 
 * - Entra sempre Over 3.
 * - Modos de negociação definem a espera após uma perda.
 */

class ZeusAI {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.name = "IA Zeus";
  }

  reset() {
    return {
      martingaleCount: 0,
      currentStake: this.config.baseStake,
      isWaitingAfterLoss: false, // True if we are currently waiting for losing digits
      lossStreak: 0,
      martingaleActive: false, // True if we have already passed the initial waiting period for the current martingale sequence
    };
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  isOver(digit, reference) {
    return digit > reference;
  }

  processSignal(digit, state) {
    // --- LÓGICA DE ESPERA APÓS A PRIMEIRA PERDA (martingale) ---
    const lossWaitCount = this.config.lossWaitCount || 0;

    if (state.isWaitingAfterLoss && lossWaitCount > 0) { // Estamos ativamente esperando lossWaitCount
      if (digit <= 3) { // is a losing digit
        state.lossStreak++;
        this.logger.log(`Aguardando sequência de dígitos under 4: ${state.lossStreak}/${lossWaitCount}`);
        if (state.lossStreak >= lossWaitCount) {
          state.isWaitingAfterLoss = false; // Parar de esperar
          state.lossStreak = 0;
          state.martingaleActive = true; // Ativar entradas a cada tick
          this.logger.log(`Sequência de under 4 dígitos atingida. Ativando entradas a cada tick.`);
        } else {
            return { shouldTrade: false }; // Continua esperando
        }
      } else { // is a winning digit, resets waiting for this specific count.
        if (state.lossStreak > 0) {
            this.logger.log(`Dígito ${digit} quebrou a sequência under 4. Resetando contagem.`);
            state.lossStreak = 0;
        }
        return { shouldTrade: false }; // Continua esperando pelos dígitos under 4
      }
    }

    // --- AÇÃO DE TRADE PADRÃO ---
    // Faz trade se não está esperando por lossWaitCount (ou já terminou de esperar),
    // ou se está no modo "a cada tick" (martingaleActive)
    if (!state.isWaitingAfterLoss || state.martingaleActive) {
        return {
            shouldTrade: true,
            entryType: "DIGITOVER",
            barrier: 3,
            payout: 0.56,
            reason: state.martingaleCount > 0 ? `ZeusAI: Gale ${state.martingaleCount} Over 3` : "ZeusAI: Entrada Over 3"
        };
    }

    return { shouldTrade: false }; // Fallback, should not be reached if logic is sound
  }

  onTradeResult(trade, state, isWin) {
    if (isWin) {
      this.logger.log(`WIN! Resetando estratégia.`, "success");
      Object.assign(state, this.reset());
    } else {
      state.martingaleCount++;
      if (state.martingaleCount >= this.config.maxMartingale) {
        this.logger.log(`Limite de perdas atingido.`, "error");
        return false; // Stop bot
      }
      state.currentStake = parseFloat((state.currentStake * this.config.multiplier).toFixed(2));
      
      const lossWaitCount = this.config.lossWaitCount || 0;
      
      if (lossWaitCount > 0) {
        if (!state.isWaitingAfterLoss && state.martingaleCount === 1) { // First loss, start waiting
          state.isWaitingAfterLoss = true;
          state.lossStreak = 0;
          state.martingaleActive = false; // Stop trading every tick for now
          this.logger.log(`Derrota. Iniciando espera por ${lossWaitCount} dígitos under 4.`);
        } else if (state.isWaitingAfterLoss) { // Lost DURING the waiting period
          state.isWaitingAfterLoss = false; // Stop waiting
          state.lossStreak = 0;
          state.martingaleActive = true; // Revert to trading every tick
          this.logger.log(`Derrota durante espera. Revertendo para entradas a cada tick.`);
        } else { // Already in martingaleActive (trading every tick)
          state.martingaleActive = true; // Ensure it stays true
          this.logger.log(`Derrota. Continuando gale a cada tick.`);
        }
      } else { // lossWaitCount is 0, so always trade every tick
        state.martingaleActive = true;
        this.logger.log(`Derrota. Continuando gale a cada tick (lossWaitCount é 0).`);
      }
    }
    return true; // Continue bot
  }

  getCurrentStake(state) {
    return parseFloat(state.currentStake.toFixed(2));
  }

  validateTradeResult(trade) {
    return trade.resultDigit > 3;
  }

  getConfigSchema() {
    return {}; // No dynamic fields for this strategy
  }

  getTradingModes() {
    return {
      "Veloz": { lossWaitCount: 2 },
      "Balanceado": { lossWaitCount: 5 },
      "Preciso": { lossWaitCount: 7 }
    };
  }

  getRiskModes() {
    return {
      "Conservador": 2.8,
      "Otimizado": 3.0,
      "Agressivo": 3.2,
    };
  }
}

module.exports = ZeusAI;