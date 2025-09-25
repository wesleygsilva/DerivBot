/**
 * Estratégia Over/Under por Dígito - Versão Avançada
 * 
 * Lógica: 
 * - Aguarda sequência de N dígitos consecutivos que sejam OVER ou UNDER
 * - Então faz entrada no dígito oposto
 * - Suporta martingale com dígito diferente
 * - Aguarda sequência específica antes do martingale
 * - Durante martingale, faz entrada a cada tick até WIN ou STOP
 */

class OverUnderStrategy {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.name = "Over/Under por Dígito";
  }

  reset() {
    return {
      consecutiveCount: 0,
      martingaleCount: 0,
      currentStake: this.config.baseStake,
      lastEntryType: null,
      martingaleTargetDigit: null,
      waitingForMartingaleSequence: false,
      martingaleSequenceCount: 0,
      martingaleActive: false, // Novo estado para controle do martingale ativo
    };
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  isOver(digit, reference) {
    return digit > reference;
  }

  isUnder(digit, reference) {
    return digit < reference;
  }

  processSignal(digit, state) {
    // Se está em martingale ativo, faz entrada a cada tick
    if (state.martingaleActive && state.martingaleCount > 0) {
      const entryType = state.lastEntryType.includes('OVER') ? 'DIGITOVER' : 'DIGITUNDER';
      const targetDigit = state.martingaleTargetDigit || this.config.martingaleTargetDigit;
      
      return {
        shouldTrade: true,
        entryType: entryType,
        barrier: targetDigit,
        reason: `Martingale ${state.martingaleCount}: Entrada contínua ${entryType} ${targetDigit}`,
      };
    }

    // Se está aguardando sequência para martingale
    if (state.waitingForMartingaleSequence) {
      return this.processMartingaleSequence(digit, state);
    }

    // Lógica normal para primeira entrada
    let conditionMet = false;
    let conditionName = "";

    if (this.config.waitFor === 'UNDER') {
      conditionMet = this.isUnder(digit, this.config.referenceDigit);
      conditionName = `UNDER ${this.config.referenceDigit}`;
    } else {
      conditionMet = this.isOver(digit, this.config.referenceDigit);
      conditionName = `OVER ${this.config.referenceDigit}`;
    }

    if (conditionMet) {
      state.consecutiveCount++;
      this.logger.log(`${conditionName} detectado: ${digit} (${state.consecutiveCount}/${this.config.minConsecutive} consecutivos)`);

      if (state.consecutiveCount >= this.config.minConsecutive) {
        // Tipo de entrada: oposto do que aguardávamos
        const entryType = this.config.waitFor === 'UNDER' ? 'DIGITOVER' : 'DIGITUNDER';
        state.lastEntryType = entryType;
        state.consecutiveCount = 0;

        return {
          shouldTrade: true,
          entryType,
          barrier: this.config.targetDigit,
          reason: `Sequência de ${this.config.minConsecutive} dígitos ${conditionName} atingida! Fazendo entrada ${entryType} ${this.config.targetDigit}`,
        };
      }
    } else {
      if (state.consecutiveCount > 0) {
        this.logger.log(`Sequência quebrada: ${digit} não é ${conditionName}. Reset contador.`);
        state.consecutiveCount = 0;
      }
    }

    return { shouldTrade: false, entryType: null, barrier: null, reason: "" };
  }

  processMartingaleSequence(digit, state) {
    // Verifica se o dígito satisfaz a condição para martingale
    let conditionMet = false;
    let conditionName = "";

    if (this.config.martingaleWaitFor === 'UNDER') {
      conditionMet = this.isUnder(digit, this.config.martingaleReferenceDigit);
      conditionName = `UNDER ${this.config.martingaleReferenceDigit}`;
    } else {
      conditionMet = this.isOver(digit, this.config.martingaleReferenceDigit);
      conditionName = `OVER ${this.config.martingaleReferenceDigit}`;
    }

    if (conditionMet) {
      state.martingaleSequenceCount++;
      this.logger.log(`Martingale - ${conditionName} detectado: ${digit} (${state.martingaleSequenceCount}/${this.config.minMartingaleSequence} consecutivos)`);

      if (state.martingaleSequenceCount >= this.config.minMartingaleSequence) {
        // Ativar modo martingale contínuo
        const entryType = this.config.martingaleWaitFor === 'UNDER' ? 'DIGITOVER' : 'DIGITUNDER';
        state.waitingForMartingaleSequence = false;
        state.martingaleSequenceCount = 0;
        state.martingaleActive = true; // Ativar martingale contínuo
        state.lastEntryType = entryType; // Salvar tipo para próximas entradas

        return {
          shouldTrade: true,
          entryType,
          barrier: this.config.martingaleTargetDigit,
          reason: `Martingale ${state.martingaleCount}: Sequência ${conditionName} atingida! Iniciando entrada contínua ${entryType} ${this.config.martingaleTargetDigit}`,
        };
      }
    } else {
      if (state.martingaleSequenceCount > 0) {
        this.logger.log(`Sequência martingale quebrada: ${digit} não é ${conditionName}. Reset contador.`);
        state.martingaleSequenceCount = 0;
      }
    }

    return { shouldTrade: false, entryType: null, barrier: null, reason: "" };
  }

  onTradeResult(trade, state, isWin) {
    if (isWin) {
      // WIN: Resetar tudo
      state.martingaleCount = 0;
      state.currentStake = this.config.baseStake;
      state.lastEntryType = null;
      state.martingaleTargetDigit = null;
      state.waitingForMartingaleSequence = false;
      state.martingaleSequenceCount = 0;
      state.martingaleActive = false; // Desativar martingale contínuo
      this.logger.log("WIN! Resetando estratégia para nova sequência", "success");
      return true;
    } else {
      // LOSS: Verificar se pode fazer martingale
      if (state.martingaleCount < this.config.maxMartingale) {
        state.martingaleCount++;
        state.currentStake = parseFloat((state.currentStake * this.config.multiplier).toFixed(2));
        state.martingaleTargetDigit = this.config.martingaleTargetDigit;
        
        // Se tem configuração de sequência para martingale E não está em martingale ativo
        if (this.config.minMartingaleSequence > 0 && 
            this.config.martingaleReferenceDigit !== undefined && 
            !state.martingaleActive) {
          // Primeira entrada do martingale: aguardar sequência
          state.waitingForMartingaleSequence = true;
          state.martingaleSequenceCount = 0;
          state.martingaleActive = false;
          this.logger.log(`Preparando Gale ${state.martingaleCount}/${this.config.maxMartingale} - Aguardando sequência ${this.config.martingaleWaitFor} ${this.config.martingaleReferenceDigit}`, "warning");
        } else {
          // Se não tem sequência configurada OU já está em martingale ativo: continuar direto
          state.martingaleActive = true;
          this.logger.log(`Gale ${state.martingaleCount}/${this.config.maxMartingale} - Entrada contínua ativada`, "warning");
        }
        
        return true;
      } else {
        // Máximo de martingales atingido
        state.martingaleActive = false;
        this.logger.log(`Gale máximo atingido. Revise a estratégia ou reinicie.`, "error");
        return false;
      }
    }
  }

  getCurrentStake(state) {
    return parseFloat(state.currentStake.toFixed(2));
  }

  getConfigSchema() {
    return {
      // Configurações da entrada principal
      waitFor: {
        type: 'select',
        label: 'Aguardar Sequência',
        options: [
          { value: 'UNDER', label: 'UNDER (dígitos menores)' },
          { value: 'OVER', label: 'OVER (dígitos maiores)' }
        ],
        default: 'UNDER'
      },
      referenceDigit: { 
        type: 'number', 
        label: 'Dígito de Referência', 
        min: 0, 
        max: 9, 
        default: 3 
      },
      targetDigit: { 
        type: 'number', 
        label: 'Dígito Alvo (Entrada Principal)', 
        min: 0, 
        max: 9, 
        default: 2 
      },
      minConsecutive: { 
        type: 'number', 
        label: 'Qtd. Consecutivos Necessários', 
        min: 1, 
        max: 20, 
        default: 3 
      },
      
      // Configurações do martingale
      martingaleTargetDigit: { 
        type: 'number', 
        label: 'Dígito Alvo (Martingale)', 
        min: 0, 
        max: 9, 
        default: 4 
      },
      martingaleWaitFor: {
        type: 'select',
        label: 'Martingale - Aguardar Sequência',
        options: [
          { value: 'UNDER', label: 'UNDER (dígitos menores)' },
          { value: 'OVER', label: 'OVER (dígitos maiores)' }
        ],
        default: 'UNDER'
      },
      martingaleReferenceDigit: { 
        type: 'number', 
        label: 'Martingale - Dígito de Referência', 
        min: 0, 
        max: 9, 
        default: 5 
      },
      minMartingaleSequence: { 
        type: 'number', 
        label: 'Martingale - Qtd. Consecutivos', 
        min: 0, 
        max: 20, 
        default: 2 
      },
      
      // Configurações gerais
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
        label: 'Máx. Martingale', 
        min: 1, 
        max: 15, 
        default: 8 
      },
      payout: { 
        type: 'number', 
        label: 'Payout (%)', 
        min: 0.1, 
        max: 5.0, 
        step: 0.01, 
        default: 0.95 
      }
    };
  }
}

module.exports = OverUnderStrategy;