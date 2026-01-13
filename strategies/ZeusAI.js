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
    const lossWaitCount = this.config.lossWaitCount || 0;

    if (state.isWaitingAfterLoss) {
      // If waiting after a loss, check if current digit is a losing digit (not over 3)
      if (!this.isOver(digit, 3)) { // If digit is 0, 1, 2, 3
        state.lossStreak++;
        this.logger.log(`Aguardando sequência de dígitos under 4: ${state.lossStreak}/${lossWaitCount}`);
        if (state.lossStreak >= lossWaitCount) {
          state.isWaitingAfterLoss = false;
          state.lossStreak = 0;
          state.martingaleActive = true; // Martingale sequence is now active, so subsequent trades are automatic
          this.logger.log(`Sequência de dígitos under 4 atingida. Gale ativo, reiniciando entradas.`);
          
          // IMMEDIATE ENTRY: Return shouldTrade: true right after meeting the condition
          return {
            shouldTrade: true,
            entryType: "DIGITOVER",
            barrier: 3,
            reason: "ZeusAI: Entrada Over 3 (após aguardar sequência de dígitos under 4)"
          };
        }
      } else {
        state.lossStreak = 0; // Reset streak if a winning digit (over 3) appears while waiting
        this.logger.log(`Dígito vencedor ${digit} enquanto aguardava. Resetando contagem de dígitos under 4.`);
      }
      return { shouldTrade: false }; // Do not trade while waiting (if condition not met yet)
    }

    // Always trade if not waiting
    return {
      shouldTrade: true,
      entryType: "DIGITOVER",
      barrier: 3,
      reason: "ZeusAI: Entrada Over 3"
    };
  }

  onTradeResult(trade, state, isWin) {
    if (isWin) {
      state.martingaleCount = 0;
      state.currentStake = this.config.baseStake;
      state.isWaitingAfterLoss = false;
      state.lossStreak = 0;
      state.martingaleActive = false; // Reset martingaleActive on win
      this.logger.log(`WIN!`);
    } else {
      this.logger.log(`LOSS.`);
      state.martingaleCount++;
      if (state.martingaleCount >= this.config.maxMartingale) {
        this.logger.log(`Limite de perdas atingido.`, "error");
        return false; // Stop bot
      }
      state.currentStake = parseFloat((state.currentStake * this.config.multiplier).toFixed(2));
      
      const lossWaitCount = this.config.lossWaitCount || 0;
      
      // If we are not yet in an active martingale sequence (i.e., this is the first loss after a win, or after initial waiting)
      // AND there's a lossWaitCount specified
      if (!state.martingaleActive && lossWaitCount > 0) {
        state.isWaitingAfterLoss = true; // Start waiting for losing digits
        state.lossStreak = 0;
        this.logger.log(`Derrota. Aguardando ${lossWaitCount} dígitos under 4 para iniciar gale.`);
      } else {
        // If martingale is already active or no lossWaitCount, just continue trading on next tick (no further waiting)
        state.martingaleActive = true; // Ensure martingale is active for subsequent ticks
        this.logger.log(`Derrota. Continuando gale.`);
      }
    }
    return true; // Continue bot
  }

  getCurrentStake(state) {
    return parseFloat(state.currentStake.toFixed(2));
  }

  getPayout() {
    return 0.56; // 56% payout for Over 3
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
      "Balanceado": { lossWaitCount: 3 },
      "Preciso": { lossWaitCount: 5 }
    };
  }
}

module.exports = ZeusAI;