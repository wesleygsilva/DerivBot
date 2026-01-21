/**
 * Estratégia Winner AI
 *
 * Lógica:
 * - Entrada normal: Over 2.
 * - Em caso de perda, a estratégia aguarda uma sequência de dígitos "over 6".
 * - A quantidade de dígitos na sequência é definida pelo "Modo de Negociação".
 * - Após a sequência, as entradas de martingale são "Under 7".
 */
class WinnerAI {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.name = "IA Winner";
    }

    reset() {
        return {
            currentState: 'NORMAL',
            martingaleCount: 0,
            currentStake: this.config.baseStake,
            sequenceCounter: 0,
        };
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    processSignal(digit, state) {
        switch (state.currentState) {
            case 'NORMAL':
                return {
                    shouldTrade: true,
                    entryType: "DIGITOVER",
                    barrier: 2,
                    payout: 0.35,
                    reason: "Winner AI: Entrada Padrão Over 2"
                };

            case 'WAITING_FOR_GALE_SEQUENCE':
                const requiredSequence = this.config.lossWaitCount || 2;
                if (digit > 6) {
                    state.sequenceCounter++;
                    this.logger.log(`Aguardando sequência de dígitos Over 6: ${state.sequenceCounter}/${requiredSequence}`);

                    if (state.sequenceCounter >= requiredSequence) {
                        this.logger.log(`Sequência Over 6 atingida. Ativando gale Under 7.`);
                        state.currentState = 'GALE_ACTIVE';
                        state.sequenceCounter = 0;

                        return {
                            shouldTrade: true,
                            entryType: "DIGITUNDER",
                            barrier: 7,
                            payout: 0.35,
                            reason: `Winner AI: Gale ${state.martingaleCount} Under 7 (após sequência)`
                        };
                    }
                } else {
                    if (state.sequenceCounter > 0) {
                        this.logger.log(`Dígito ${digit} quebrou a sequência Over 6. Resetando contagem.`);
                        state.sequenceCounter = 0;
                    }
                }
                return { shouldTrade: false };

            case 'GALE_ACTIVE':
                return {
                    shouldTrade: true,
                    entryType: "DIGITUNDER",
                    barrier: 7,
                    payout: 0.35,
                    reason: `Winner AI: Gale ${state.martingaleCount} Under 7`
                };

            default:
                return { shouldTrade: false };
        }
    }

    onTradeResult(trade, state, isWin) {
        if (isWin) {
            this.logger.log(`WIN! Resetando estratégia.`, "success");
            Object.assign(state, this.reset());
        } else {
            this.logger.log(`LOSS.`);
            state.martingaleCount++;

            if (state.martingaleCount > this.config.maxMartingale) {
                this.logger.log(`Limite de perdas atingido.`, "error");
                Object.assign(state, this.reset());
                return false;
            }

            state.currentStake = parseFloat((state.currentStake * this.config.multiplier).toFixed(2));

            if (state.currentState === 'NORMAL') {
                const requiredSequence = this.config.lossWaitCount || 2;
                state.currentState = 'WAITING_FOR_GALE_SEQUENCE';
                state.sequenceCounter = 0;
                this.logger.log(`Derrota. Gale ${state.martingaleCount} ativado. Aguardando ${requiredSequence} dígitos Over 6 para entrar Under 7.`);
            } else {
                this.logger.log(`Derrota no Gale ${state.martingaleCount}. Próxima entrada Under 7.`);
            }
        }
        return true;
    }

    getCurrentStake(state) {
        return parseFloat(state.currentStake.toFixed(2));
    }

    validateTradeResult(trade) {
        const { entryType, barrier, resultDigit } = trade;
        if (entryType === 'DIGITOVER') {
            return resultDigit > barrier;
        } else if (entryType === 'DIGITUNDER') {
            return resultDigit < barrier;
        }
        return false;
    }

    getConfigSchema() {
        return {};
    }

    getTradingModes() {
        return {
            "Veloz": { lossWaitCount: 2 },
            "Balanceado": { lossWaitCount: 3 },
            "Preciso": { lossWaitCount: 4 }
        };
    }

    getRiskModes() {
        return {
            "Conservador": 3.5,
            "Otimizado": 4.0,
            "Agressivo": 4.2,
        };
    }
}

module.exports = WinnerAI;
