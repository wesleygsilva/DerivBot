/**
 * Estratégia Base AI
 *
 * Descreva a lógica da sua estratégia aqui.
 */

class BaseAI {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.name = "Base AI";
  }

  reset() {
    // Redefine o estado da estratégia para o estado inicial.
    return {
      currentState: 'NORMAL',
      martingaleCount: 0,
      currentStake: this.config.baseStake,
    };
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  processSignal(digit, state) {
    // Lógica principal da sua estratégia vai aqui.
    // Decida se deve ou não fazer uma negociação com base no 'dígito' e no 'estado' atual.

    // Exemplo: Entrar "Over 5" em cada tick.
    return {
      shouldTrade: true,
      entryType: "DIGITOVER",
      barrier: 5,
      payout: 0.95, // Exemplo de payout
      reason: "Base AI: Entrada Padrão"
    };
  }

  onTradeResult(trade, state, isWin) {
    // Lógica para lidar com o resultado de uma negociação (vitória ou derrota).
    if (isWin) {
      this.logger.log(`WIN! Resetando estratégia.`, "success");
      Object.assign(state, this.reset());
    } else {
      this.logger.log(`LOSS.`);
      state.martingaleCount++;

      if (state.martingaleCount > this.config.maxMartingale) {
        this.logger.log(`Limite de perdas atingido.`, "error");
        Object.assign(state, this.reset());
        return false; // Sinaliza para parar o bot
      }

      state.currentStake = parseFloat((state.currentStake * this.config.multiplier).toFixed(2));
      this.logger.log(`Derrota. Gale ${state.martingaleCount} ativado.`);
    }
    return true; // Continuar bot
  }

  getCurrentStake(state) {
    return parseFloat(state.currentStake.toFixed(2));
  }

  validateTradeResult(trade) {
    const { barrier, resultDigit } = trade;
    // Adapte esta lógica se sua estratégia for diferente (ex: DIGITUNDER, DIGITDIFFERS, etc.)
    return resultDigit > barrier;
  }

  getConfigSchema() {
    // Se sua estratégia precisar de configurações personalizadas, defina-as aqui.
    return {};
  }

  getTradingModes() {
    // Modos de negociação personalizados (opcional).
    return {};
  }

  getRiskModes() {
    // Modos de risco personalizados (opcional).
    return {};
  }
}

module.exports = BaseAI;
