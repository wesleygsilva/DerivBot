// debug.js - Utilitários para debug e diagnóstico

// Função para testar conexão com a API
function testConnection(token) {
  const testWs = new WebSocket('wss://ws.binaryws.com/websockets/v3?app_id=1089');
  
  testWs.onopen = function() {
    console.log('🔗 Teste de conexão: SUCESSO');
    
    // Testar autorização
    testWs.send(JSON.stringify({
      authorize: token
    }));
  };
  
  testWs.onmessage = function(event) {
    const data = JSON.parse(event.data);
    console.log('📨 Resposta do teste:', data);
    
    if (data.authorize) {
      console.log('✅ Token válido!');
      console.log('💰 Saldo:', data.authorize.balance);
      console.log('💱 Moeda:', data.authorize.currency);
      console.log('🏛️ País:', data.authorize.country);
      
      // Testar subscrição de ticks
      testWs.send(JSON.stringify({
        ticks: 'R_10',
        subscribe: 1
      }));
      
    } else if (data.tick) {
      console.log('📊 Tick recebido:', data.tick.quote, '- Último dígito:', data.tick.quote.toString().slice(-1));
      
      // Fechar após receber alguns ticks
      setTimeout(() => {
        testWs.close();
        console.log('🔚 Teste finalizado com sucesso!');
      }, 5000);
      
    } else if (data.error) {
      console.error('❌ Erro no teste:', data.error);
      testWs.close();
    }
  };
  
  testWs.onerror = function(error) {
    console.error('🚫 Erro de conexão:', error);
  };
  
  testWs.onclose = function() {
    console.log('🔌 Conexão de teste fechada');
  };
}

// Função para validar formato do token
function validateTokenFormat(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token deve ser uma string não vazia' };
  }
  
  if (token.length < 20) {
    return { valid: false, error: 'Token parece muito curto (mínimo 20 caracteres)' };
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(token)) {
    return { valid: false, error: 'Token contém caracteres inválidos' };
  }
  
  return { valid: true };
}

// Função para simular estratégia com dados históricos
function simulateStrategy(historicalDigits) {
  let results = {
    trades: 0,
    wins: 0,
    losses: 0,
    currentStake: 1,
    balance: 100,
    waitingForPairs: 0,
    martingaleCount: 0
  };
  
  console.log('🧮 Simulando estratégia com', historicalDigits.length, 'dígitos históricos...');
  
  for (let i = 0; i < historicalDigits.length; i++) {
    const digit = historicalDigits[i];
    
    if (digit % 2 === 0) {
      // Dígito par
      results.waitingForPairs++;
    } else {
      // Dígito ímpar
      if (results.waitingForPairs >= 6 || results.martingaleCount > 0) {
        // Fazer entrada
        results.trades++;
        
        // Simular resultado (50/50 para teste)
        const isWin = Math.random() > 0.5;
        
        if (isWin) {
          results.wins++;
          results.waitingForPairs = 0;
          results.martingaleCount = 0;
          results.currentStake = 1;
          console.log(`✅ Trade ${results.trades}: VITÓRIA`);
        } else {
          results.losses++;
          results.balance -= results.currentStake;
          results.martingaleCount++;
          results.currentStake *= 2.2;
          console.log(`❌ Trade ${results.trades}: DERROTA`);
        }
      }
    }
  }
  
  console.log('📊 Resultados da simulação:');
  console.log('- Total de trades:', results.trades);
  console.log('- Vitórias:', results.wins);
  console.log('- Derrotas:', results.losses);
  console.log('- Win Rate:', results.trades > 0 ? ((results.wins / results.trades) * 100).toFixed(1) + '%' : '0%');
  console.log('- Saldo final:', results.balance.toFixed(2));
  
  return results;
}

// Função para gerar dados de teste
function generateTestDigits(count = 100) {
  const digits = [];
  for (let i = 0; i < count; i++) {
    digits.push(Math.floor(Math.random() * 10));
  }
  return digits;
}

// Função para verificar saúde do sistema
function systemHealthCheck() {
  const health = {
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    nodeVersion: process.version,
    platform: process.platform
  };
  
  console.log('🏥 Verificação de saúde do sistema:');
  console.log('- Memória usada:', (health.memory.heapUsed / 1024 / 1024).toFixed(2), 'MB');
  console.log('- Tempo ativo:', Math.floor(health.uptime / 60), 'minutos');
  console.log('- Versão Node.js:', health.nodeVersion);
  console.log('- Plataforma:', health.platform);
  
  return health;
}

// Função para análise de padrões nos dígitos
function analyzeDigitPatterns(digits) {
  const analysis = {
    total: digits.length,
    even: digits.filter(d => d % 2 === 0).length,
    odd: digits.filter(d => d % 2 === 1).length,
    distribution: {},
    consecutivePairs: 0,
    maxConsecutivePairs: 0,
    currentStreak: 0
  };
  
  // Distribuição por dígito
  for (let i = 0; i <= 9; i++) {
    analysis.distribution[i] = digits.filter(d => d === i).length;
  }
  
  // Análise de sequências de pares
  let currentPairStreak = 0;
  for (const digit of digits) {
    if (digit % 2 === 0) {
      currentPairStreak++;
      analysis.maxConsecutivePairs = Math.max(analysis.maxConsecutivePairs, currentPairStreak);
    } else {
      if (currentPairStreak >= 6) {
        analysis.consecutivePairs++;
      }
      currentPairStreak = 0;
    }
  }
  
  console.log('📈 Análise de padrões:');
  console.log('- Total de dígitos:', analysis.total);
  console.log('- Pares:', analysis.even, `(${((analysis.even / analysis.total) * 100).toFixed(1)}%)`);
  console.log('- Ímpares:', analysis.odd, `(${((analysis.odd / analysis.total) * 100).toFixed(1)}%)`);
  console.log('- Sequências de 6+ pares:', analysis.consecutivePairs);
  console.log('- Maior sequência de pares:', analysis.maxConsecutivePairs);
  console.log('- Distribuição:', analysis.distribution);
  
  return analysis;
}

// Exportar funções se estiver em Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    testConnection,
    validateTokenFormat,
    simulateStrategy,
    generateTestDigits,
    systemHealthCheck,
    analyzeDigitPatterns
  };
}

// Exemplos de uso no console do navegador:
/*
// Testar token
validateTokenFormat('seu_token_aqui');

// Simular estratégia
const testDigits = generateTestDigits(200);
simulateStrategy(testDigits);

// Analisar padrões
analyzeDigitPatterns(testDigits);

// Verificar saúde (só no servidor)
systemHealthCheck();
*/