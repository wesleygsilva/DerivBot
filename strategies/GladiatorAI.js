/**
 * Estratégia IA Gladiator
 * 
 * Lógica: 
 * - Entrada normal: Over 2.
 * - Em caso de perda, a estratégia muda para aguardar uma sequência de dígitos "under 5".
 * - Após a sequência, as entradas de martingale são "Over 4".
 */

class GladiatorAI {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.name = "IA Gladiator";
  }

  reset() {
    return {
      // Estado principal: 'NORMAL', 'WAITING_FOR_GALE_SEQUENCE', 'GALE_ACTIVE'
      currentState: 'NORMAL',
      martingaleCount: 0,
      currentStake: this.config.baseStake,
      // Usado para contar a sequência de dígitos para o gale
      sequenceCounter: 0,
    };
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  processSignal(digit, state) {
    switch (state.currentState) {
      case 'NORMAL':
        // No estado normal, entra Over 2 em todos os ticks.
        return {
          shouldTrade: true,
          entryType: "DIGITOVER",
          barrier: 2,
          payout: 0.35, // Payout para entrada normal
          reason: "Gladiator AI: Entrada Padrão Over 2"
        };
      
      case 'WAITING_FOR_GALE_SEQUENCE':
        const requiredSequence = this.config.lossWaitCount || 2; // Padrão 3 (Veloz)
        
        if (digit < 5) {
          state.sequenceCounter++;
          this.logger.log(`Aguardando sequência de dígitos Under 5: ${state.sequenceCounter}/${requiredSequence}`);
          
          if (state.sequenceCounter >= requiredSequence) {
            this.logger.log(`Sequência Under 5 atingida. Ativando gale Over 4.`);
            state.currentState = 'GALE_ACTIVE';
            state.sequenceCounter = 0; // Reseta o contador
            
            // Faz a primeira entrada de gale imediatamente
            return {
              shouldTrade: true,
              entryType: "DIGITOVER",
              barrier: 4,
              payout: 0.85, // Payout para gale
              reason: `Gladiator AI: Gale ${state.martingaleCount} Over 4 (após sequência)`
            };
          }
        } else {
          // Se um dígito >= 5 aparecer, a contagem da sequência é zerada.
          if (state.sequenceCounter > 0) {
            this.logger.log(`Dígito ${digit} quebrou a sequência Under 5. Resetando contagem.`);
            state.sequenceCounter = 0;
          }
        }
        // Não faz trade enquanto espera a sequência
        return { shouldTrade: false };

      case 'GALE_ACTIVE':
        // Uma vez no modo gale, entra Over 4 em todos os ticks.
        return {
          shouldTrade: true,
          entryType: "DIGITOVER",
          barrier: 4,
          payout: 0.85, // Payout para gale
          reason: `Gladiator AI: Gale ${state.martingaleCount} Over 4`
        };

      default:
        return { shouldTrade: false };
    }
  }

  onTradeResult(trade, state, isWin) {
    if (isWin) {
      this.logger.log(`WIN! Resetando estratégia.`, "success");
      // Em caso de vitória, reseta tudo para o estado inicial.
      Object.assign(state, this.reset());
    } else {
      this.logger.log(`LOSS.`);
      state.martingaleCount++;
      
      if (state.martingaleCount > this.config.maxMartingale) {
        this.logger.log(`Limite de perdas atingido.`, "error");
        Object.assign(state, this.reset()); // Reseta o estado
        return false; // Sinaliza para parar o bot
      }

      // Calcula o próximo stake
      state.currentStake = parseFloat((state.currentStake * this.config.multiplier).toFixed(2));
      
      if (state.currentState === 'NORMAL') {
        // Se a primeira perda acontece, muda para o estado de espera.
        const requiredSequence = this.config.lossWaitCount || 2;
        state.currentState = 'WAITING_FOR_GALE_SEQUENCE';
        state.sequenceCounter = 0;
        this.logger.log(`Derrota. Gale ${state.martingaleCount} ativado. Aguardando ${requiredSequence} dígitos Under 5 para entrar Over 4.`);
      } else {
        // Se já estava no modo GALE_ACTIVE, continua nele, apenas loga.
        this.logger.log(`Derrota no Gale ${state.martingaleCount}. Próxima entrada Over 4.`);
      }
    }
    return true; // Continuar bot
  }

  getCurrentStake(state) {
    return parseFloat(state.currentStake.toFixed(2));
  }

  validateTradeResult(trade) {
    const { barrier, resultDigit } = trade;
    return resultDigit > barrier;
  }

  // Remove as configurações antigas que não são mais necessárias.
  getConfigSchema() {
    return {};
  }

  // Define os modos de negociação que controlam a espera do gale.
  getTradingModes() {
    return {
      "Veloz": { lossWaitCount: 2 },
      "Balanceado": { lossWaitCount: 4 },
      "Preciso": { lossWaitCount: 6 }
    };
  }

  getRiskModes() {
    return {
      "Conservador": 2.2,
      "Otimizado": 2.4,
      "Agressivo": 2.6,
    };
  }
}

module.exports = GladiatorAI;
