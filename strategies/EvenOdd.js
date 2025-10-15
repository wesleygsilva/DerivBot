/**
 * Estratégia Par/Ímpar
 * 
 * Lógica: 
 * - Aguarda uma sequência de N dígitos pares consecutivos, então aposta em ímpar
 * - Aguarda uma sequência de N dígitos ímpares consecutivos, então aposta em par
 * - Usa martingale em caso de loss
 */

class EvenOddStrategy {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.name = "Par/Ímpar";
  }

  /**
   * Reseta o estado da estratégia
   */
  reset() {
    return {
      waitingForEven: 0,
      waitingForOdd: 0,
      martingaleCount: 0,
      currentStake: this.config.baseStake,
      lastEntryType: null, // Para manter consistência no martingale
    };
  }

  /**
   * Atualiza as configurações da estratégia
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Processa um novo dígito e decide se deve fazer entrada
   */
  processSignal(digit, state) {
    // Se está em martingale, faz entrada imediata mantendo a mesma estratégia
    if (state.martingaleCount > 0 && state.lastEntryType) {
      const reason = `Martingale ${state.martingaleCount}: Entrada ${state.lastEntryType === 'DIGITODD' ? 'ÍMPAR' : 'PAR'} (continuando estratégia)`;
      
      return {
        shouldTrade: true,
        entryType: state.lastEntryType,
        reason: reason
      };
    }

    // LÓGICA NORMAL (não está em martingale)
    if (digit % 2 === 0) {
      // Dígito PAR - conta para sequência de pares
      state.waitingForEven++;
      state.waitingForOdd = 0; // Reset contador de ímpares
      
      this.logger.log(`Par detectado: ${digit} (${state.waitingForEven}/${this.config.minEven} pares consecutivos)`);

      // Se atingiu a quantidade configurada de pares, apostar em ÍMPAR
      if (state.waitingForEven >= this.config.minEven) {
        state.lastEntryType = "DIGITODD";
        return {
          shouldTrade: true,
          entryType: "DIGITODD",
          reason: `Sequência de ${this.config.minEven} pares atingida! Fazendo entrada em ÍMPAR`
        };
      }
    } else {
      // Dígito ÍMPAR - conta para sequência de ímpares
      state.waitingForOdd++;
      state.waitingForEven = 0; // Reset contador de pares
      
      this.logger.log(`Ímpar detectado: ${digit} (${state.waitingForOdd}/${this.config.minOdd} ímpares consecutivos)`);

      // Se atingiu a quantidade configurada de ímpares, apostar em PAR
      if (state.waitingForOdd >= this.config.minOdd) {
        state.lastEntryType = "DIGITEVEN";
        return {
          shouldTrade: true,
          entryType: "DIGITEVEN",
          reason: `Sequência de ${this.config.minOdd} ímpares atingida! Fazendo entrada em PAR`
        };
      }
    }

    return {
      shouldTrade: false,
      entryType: null,
      reason: ""
    };
  }

  /**
   * Valida se o resultado do trade foi WIN ou LOSS
   * @param {object} trade - Objeto do trade com { entryType, resultDigit }
   * @returns {boolean} true se WIN, false se LOSS
   */
  validateTradeResult(trade) {
    const { entryType, resultDigit } = trade;
    
    if (entryType === 'DIGITODD') {
      // Para DIGITODD, o dígito precisa ser ÍMPAR (1, 3, 5, 7, 9)
      const isWin = resultDigit % 2 === 1;
      this.logger.log(`Validação DIGITODD: resultado ${resultDigit} ${isWin ? 'WIN' : 'LOSS'} (precisa ser ímpar)`, isWin ? 'success' : 'error');
      return isWin;
    } else if (entryType === 'DIGITEVEN') {
      // Para DIGITEVEN, o dígito precisa ser PAR (0, 2, 4, 6, 8)
      const isWin = resultDigit % 2 === 0;
      this.logger.log(`Validação DIGITEVEN: resultado ${resultDigit} ${isWin ? 'WIN' : 'LOSS'} (precisa ser par)`, isWin ? 'success' : 'error');
      return isWin;
    }
    
    this.logger.log(`Tipo de entrada desconhecido: ${entryType}`, 'error');
    return false;
  }

  /**
   * Processa o resultado de um trade
   */
  onTradeResult(trade, state, isWin) {
    if (isWin) {
      // WIN: Reset completo - volta ao estado inicial
      state.martingaleCount = 0;
      state.currentStake = this.config.baseStake;
      state.waitingForEven = 0;
      state.waitingForOdd = 0;
      state.lastEntryType = null;
      
      this.logger.log(`WIN! Resetando estratégia para nova sequência`, "success");
      return true; // Continuar bot
    } else {
      // LOSS: Verificar se pode fazer martingale
      if (state.martingaleCount < this.config.maxMartingale) {
        state.martingaleCount++;
        state.currentStake *= this.config.multiplier;
        state.currentStake = parseFloat(state.currentStake.toFixed(2));
        
        this.logger.log(`Preparando Gale ${state.martingaleCount}/${this.config.maxMartingale}`, "warning");
        return true; // Continuar bot
      } else {
        // Gale máximo atingido
        this.logger.log(`Gale máximo atingido. Revise a estratégia ou reinicie.`, "error");
        return false; // Parar bot
      }
    }
  }

  /**
   * Retorna o stake atual para a próxima entrada
   */
  getCurrentStake(state) {
    return parseFloat(state.currentStake.toFixed(2));
  }

  /**
   * Retorna informações sobre o estado atual da estratégia
   */
  getStatusInfo(state) {
    return {
      name: this.name,
      waitingForEven: state.waitingForEven,
      waitingForOdd: state.waitingForOdd,
      martingaleLevel: state.martingaleCount,
      currentStake: state.currentStake,
      nextEntry: state.lastEntryType || 'Aguardando sequência'
    };
  }

  /**
   * Retorna as configurações específicas desta estratégia
   */
  getConfigSchema() {
    return {
      minEven: {
        type: 'number',
        label: 'Mín. Pares Consecutivos',
        min: 1,
        max: 20,
        default: 3
      },
      minOdd: {
        type: 'number',
        label: 'Mín. Ímpares Consecutivos',
        min: 1,
        max: 20,
        default: 3
      },
      baseStake: {
        type: 'number',
        label: 'Stake Inicial',
        min: 0.35,
        step: 0.01,
        default: 0.35
      },
      multiplier: {
        type: 'number',
        label: 'Multiplicador Martingale',
        min: 1.1,
        step: 0.1,
        default: 2.2
      },
      maxMartingale: {
        type: 'number',
        label: 'Limite de Perda',
        min: 1,
        max: 15,
        default: 6
      }
    };
  }
}

module.exports = EvenOddStrategy;