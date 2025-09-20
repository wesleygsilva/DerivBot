const WebSocket = require("ws");

// ====================== CONFIG ======================
const TOKEN = "MGhzABk2rbbNsyN"; // coloque seu token da Deriv
const APP_ID = 1089; // pode usar este app_id padrão
const SYMBOL = "R_10"; // índice volatilidade 10
const STAKE = 0.35; // valor inicial da aposta
const MULTIPLICADOR_GALE = 2.2; // multiplicador do gale
let galeAtual = 0;
let stakeAtual = STAKE;

let ultimoDigito = null;
let contratoEmAberto = false;

// ====================== CONEXÃO ======================
const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);

ws.on("open", () => {
    console.log("Conectado ao WebSocket Deriv 🚀");
    // Autenticar
    ws.send(JSON.stringify({ authorize: TOKEN }));
});

ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.error) {
        console.log("❌ Erro:", data.error.message);
        return;
    }

    if (data.msg_type === "authorize") {
        console.log("✅ Autenticado com sucesso!");
        // Inscrever nos ticks
        ws.send(JSON.stringify({ ticks: SYMBOL }));
    }

    if (data.msg_type === "tick") {
        let tick = data.tick;
        ultimoDigito = tick.quote.toString().slice(-1);
        console.log(`📊 Tick: ${tick.quote} | Dígito Local: ${ultimoDigito}`);

        // Estratégia: entrar quando dígito for par
        if (!contratoEmAberto) {
            if (parseInt(ultimoDigito) % 2 === 0) {
                console.log("🎯 Condição atendida! Entrando na operação...");
                entrarNaOperacao("DIGITEVEN");
            }
        }
    }

    if (data.msg_type === "proposal_open_contract") {
        if (data.proposal_open_contract.is_sold) {
            contratoEmAberto = false;
            if (data.proposal_open_contract.profit > 0) {
                console.log("✅ WIN detectado!");
                galeAtual = 0;
                stakeAtual = STAKE;
            } else {
                console.log(`❌ LOSS detectado! Último dígito: ${ultimoDigito}`);
                galeAtual++;
                stakeAtual *= MULTIPLICADOR_GALE;
                console.log(`➡️ Aplicando Gale ${galeAtual}, novo stake: ${stakeAtual}`);
            }
        }
    }
});

// ====================== FUNÇÃO ENTRADA ======================
function entrarNaOperacao(contract_type) {
    contratoEmAberto = true;

    const proposal = {
        buy: 1,
        price: stakeAtual.toFixed(2),
        parameters: {
            amount: stakeAtual.toFixed(2),
            basis: "stake",
            contract_type: contract_type,
            currency: "USD",
            duration: 1,
            duration_unit: "t",
            symbol: SYMBOL
        }
    };

    ws.send(JSON.stringify(proposal));
    console.log(`🚀 Contrato enviado: ${contract_type} | Stake: ${stakeAtual.toFixed(2)}`);
}
