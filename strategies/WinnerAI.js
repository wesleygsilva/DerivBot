class WinnerAI {
    constructor(options) {
        this.options = options; // This will hold initialStake, mode, galeMode, symbol, maxMartingale, profitGoal
        this.name = "IA Winner";

        // Strategy specific settings are now properties of the instance
        this.initialStake = options.stake || options.baseStake || 0.35; // Prioritize options.stake, then options.baseStake
        this.mode = options.mode || 'Otimizado'; // Veloz, Balanceado, Preciso
        this.galeMode = options.galeMode || 'Otimizado'; // Conservador, Otimizado, Agressivo
        this.maxMartingale = options.maxMartingale || 4; // Default max martingale steps
        this.profitGoal = options.profitGoal || 0; // Default profit goal

        this.galeMultipliers = {
            Conservador: 3.5,
            Otimizado: 4,
            Agressivo: 4.2
        };

        console.log(`WinnerAI initialized with mode: ${this.mode}, galeMode: ${this.galeMode}, maxMartingale: ${this.maxMartingale}, profitGoal: ${this.profitGoal}`);
    }

    // `start` and `stop` are now empty as the state is managed externally
    start() {
        console.log('WinnerAI started (stateless mode).');
    }

    stop() {
        console.log('WinnerAI stopped (stateless mode).');
    }

    reset() {
        return {
            tradeCount: 0,
            winCount: 0,
            lossCount: 0,
            currentStake: this.initialStake, // Use initialStake from constructor
            galeMultiplier: 1,
            overSixSequence: 0, // To track consecutive over 6 ticks for 'Modo' logic
            // Copy strategy settings for easier access in processSignal/onTradeResult
            mode: this.mode,
            galeMode: this.galeMode,
            initialStake: this.initialStake,
            maxMartingale: this.maxMartingale,
            profitGoal: this.profitGoal
        };
    }

    updateConfig(newConfig) {
        this.options = { ...this.options, ...newConfig };
        // Update instance properties that depend on options
        this.initialStake = this.options.stake || this.options.baseStake || this.initialStake; // Prioritize newConfig.stake, then newConfig.baseStake
        this.mode = this.options.mode || this.mode;
        this.galeMode = this.options.galeMode || this.galeMode;
        this.maxMartingale = this.options.maxMartingale || this.maxMartingale;
        this.profitGoal = this.options.profitGoal || this.profitGoal;
        console.log(`WinnerAI config updated: mode: ${this.mode}, galeMode: ${this.galeMode}, initialStake: ${this.initialStake}, maxMartingale: ${this.maxMartingale}, profitGoal: ${this.profitGoal}`);
    }

    processSignal(lastDigit, state) {
        // Update overSixSequence in the state object
        if (lastDigit >= 6) {
            state.overSixSequence++;
        } else {
            state.overSixSequence = 0;
        }

        let contractType;
        let barrier;
        const symbol = this.options.symbol || 'R_100'; // Default symbol

        if (state.lossCount === 0) {
            // Initial trade: Over 2
            contractType = 'DIGITOVER';
            barrier = '2';
            const reason = "WinnerAI: Initial trade Over 2";
            console.log(reason);
            return {
                shouldTrade: true,
                entryType: contractType,
                barrier: barrier,
                stake: state.currentStake, // Changed from amount to stake
                payout: 0.19, // Correct Payout for Over 2
                duration: '1t',
                duration_unit: 't',
                symbol: symbol,
                reason: reason
            };
        } else {
            // Gale trade: Under 7, with re-entry conditions based on 'mode'
            let overSixThreshold = 0;
            if (state.mode === 'Veloz') {
                overSixThreshold = 2;
            } else if (state.mode === 'Balanceado') {
                overSixThreshold = 3;
            } else if (state.mode === 'Preciso') {
                overSixThreshold = 4;
            }

            if (state.overSixSequence >= overSixThreshold) {
                contractType = 'DIGITUNDER';
                barrier = '7';
                const reason = `WinnerAI: Gale trade Under 7 (overSixSequence: ${state.overSixSequence})`;
                console.log(reason);
                return {
                    shouldTrade: true,
                    entryType: contractType,
                    barrier: barrier,
                    stake: state.currentStake, // Changed from amount to stake
                    payout: 0.35, // Payout for Under 7
                    duration: '1t',
                    duration_unit: 't',
                    symbol: symbol,
                    reason: reason
                };
            } else {
                console.log(`WinnerAI: Waiting for over six sequence (current: ${state.overSixSequence}/${overSixThreshold})`);
                return { shouldTrade: false };
            }
        }
    }

    onTradeResult(trade, state, isWin) {
        state.tradeCount++;
        if (isWin) {
            console.log('WinnerAI: Win!');
            state.winCount++;
            state.lossCount = 0; // Reset loss count on win
            state.currentStake = state.initialStake; // Reset stake on win
            state.galeMultiplier = 1; // Reset gale multiplier on win
            state.overSixSequence = 0; // Reset over six sequence on win
        } else {
            console.log('WinnerAI: Loss!');
            state.lossCount++;
            const galeMultipliers = {
                Conservador: 3.5,
                Otimizado: 4,
                Agressivo: 4.2
            };
            state.galeMultiplier = galeMultipliers[state.galeMode]; // Apply gale multiplier based on galeMode from instance
            state.currentStake = parseFloat((state.currentStake * state.galeMultiplier).toFixed(2)); // Increase stake for gale

            if (state.maxMartingale > 0 && state.lossCount >= state.maxMartingale) {
                console.log(`WinnerAI: Max perdas atingido! ${state.lossCount} perdas consecutivas.`, "error");
                return false; // Signal to stop the bot
            }
        }
        console.log(`Wins: ${state.winCount}, Losses: ${state.lossCount}, Total Trades: ${state.tradeCount}`);
        return true; // Indicate that the bot should continue
    }

    getCurrentStake(state) {
        return parseFloat(state.currentStake.toFixed(2));
    }

    getConfigSchema() {
        return {
            stake: {
                type: 'number',
                label: 'Aposta Inicial',
                default: 0.35,
                min: 0.35,
                step: 0.01
            },
            profitGoal: {
                type: 'number',
                label: 'Meta de Lucro',
                default: 0,
                min: 0,
                step: 0.01
            },
            maxMartingale: {
                type: 'number',
                label: 'Máximo de Martingales (Perdas)',
                default: 6,
                min: 0,
                step: 1
            },
            mode: {
                type: 'select',
                label: 'Modo de Re-entrada (após perda)',
                default: 'Otimizado',
                options: ['Veloz', 'Balanceado', 'Preciso']
            },
            galeMode: {
                type: 'select',
                label: 'Multiplicador Gale',
                default: 'Otimizado',
                options: ['Conservador', 'Otimizado', 'Agressivo']
            },
            symbol: {
                type: 'string',
                label: 'Símbolo do Ativo',
                default: 'R_100',
            }
        };
    }
}

module.exports = WinnerAI;