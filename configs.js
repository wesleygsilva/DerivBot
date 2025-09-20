// config.js - Configurações avançadas opcionais
// Este arquivo permite personalizar ainda mais o comportamento do bot

const advancedConfig = {
  // Configurações de conexão
  connection: {
    appId: 1089, // App ID da Deriv (não alterar)
    websocketUrl: 'wss://ws.binaryws.com/websockets/v3',
    reconnectAttempts: 5,
    reconnectDelay: 3000 // 3 segundos
  },

  // Configurações de trading
  trading: {
    defaultSymbol: 'R_10', // Volatilidade 10 (1s)
    alternativeSymbols: ['R_25', 'R_50', 'R_75', 'R_100'], // Outras opções
    contractTypes: {
      digitOdd: 'DIGITODD',
      digitEven: 'DIGITEVEN',
      digitOver: 'DIGITOVER',
      digitUnder: 'DIGITUNDER'
    },
    duration: 1, // 1 tick
    durationUnit: 't', // tick
    currency: 'USD'
  },

  // Configurações de estratégia
  strategy: {
    pairsRequired: 6, // Número de dígitos pares necessários
    maxMartingale: 5, // Máximo de martingales
    baseMartingaleMultiplier: 2.2, // Multiplicador padrão
    
    // Multiplicadores personalizados por nível
    customMultipliers: {
      1: 2.2,
      2: 2.3,
      3: 2.4,
      4: 2.5,
      5: 2.6
    },

    // Limites de segurança
    maxStakePercentage: 10, // Máximo 10% do saldo por trade
    dailyLossLimit: 50, // Parar se perder mais que $50 no dia
    dailyProfitTarget: 100, // Parar se lucrar mais que $100 no dia
    
    // Horários de funcionamento (UTC)
    tradingHours: {
      enabled: false, // Desabilitar para operar 24/7
      start: '08:00',
      end: '18:00',
      timezone: 'America/Sao_Paulo'
    }
  },

  // Configurações de logs
  logging: {
    maxLogs: 100, // Máximo de logs mantidos em memória
    levels: ['info', 'warning', 'error', 'success'], // Níveis de log
    saveToFile: false, // Salvar logs em arquivo (futuro)
    detailedTicks: false // Log detalhado de todos os ticks
  },

  // Configurações de interface
  ui: {
    theme: 'light', // 'light' ou 'dark'
    autoScroll: true, // Auto scroll nos logs
    soundNotifications: true, // Notificações sonoras
    updateInterval: 1000, // Intervalo de atualização da UI (ms)
    
    // Cores personalizadas
    colors: {
      profit: '#28a745',
      loss: '#dc3545',
      warning: '#ffc107',
      info: '#17a2b8',
      primary: '#007bff'
    }
  },

  // Configurações de segurança
  security: {
    tokenValidation: true, // Validar token antes de usar
    rateLimiting: true, // Limitar requisições à API
    maxRequestsPerMinute: 30,
    encryptLogs: false // Criptografar logs sensíveis (futuro)
  },

  // Configurações de backup e recovery
  backup: {
    autoBackup: false, // Backup automático de estatísticas
    backupInterval: 3600000, // 1 hora em ms
    maxBackups: 10 // Máximo de backups mantidos
  },

  // Configurações experimentais
  experimental: {
    aiAnalysis: false, // Análise com IA (futuro)
    patternRecognition: false, // Reconhecimento de padrões
    adaptiveStaking: false, // Ajuste automático do stake
    multiStrategy: false // Múltiplas estratégias simultâneas
  }
};

// Função para validar configurações
function validateConfig(config) {
  const errors = [];

  // Validar multiplicadores
  if (config.strategy.baseMartingaleMultiplier < 1.1) {
    errors.push('Multiplicador do martingale deve ser >= 1.1');
  }

  // Validar limites
  if (config.strategy.maxStakePercentage > 20) {
    errors.push('Máximo de stake por trade não deve exceder 20%');
  }

  // Validar pares requeridos
  if (config.strategy.pairsRequired < 3 || config.strategy.pairsRequired > 10) {
    errors.push('Número de pares deve estar entre 3 e 10');
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

// Função para mesclar configurações
function mergeConfig(userConfig = {}) {
  return {
    ...advancedConfig,
    ...userConfig,
    strategy: {
      ...advancedConfig.strategy,
      ...(userConfig.strategy || {})
    },
    ui: {
      ...advancedConfig.ui,
      ...(userConfig.ui || {})
    }
  };
}

// Configurações de diferentes perfis de risco
const riskProfiles = {
  conservative: {
    strategy: {
      maxMartingale: 3,
      baseMartingaleMultiplier: 2.0,
      maxStakePercentage: 5,
      dailyLossLimit: 20
    }
  },
  
  moderate: {
    strategy: {
      maxMartingale: 5,
      baseMartingaleMultiplier: 2.2,
      maxStakePercentage: 10,
      dailyLossLimit: 50
    }
  },
  
  aggressive: {
    strategy: {
      maxMartingale: 7,
      baseMartingaleMultiplier: 2.5,
      maxStakePercentage: 15,
      dailyLossLimit: 100
    }
  }
};

// Exportar configurações (se usando módulos)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    advancedConfig,
    validateConfig,
    mergeConfig,
    riskProfiles
  };
}

// Exemplo de uso:
/*
const config = mergeConfig({
  strategy: {
    maxMartingale: 3,
    dailyLossLimit: 30
  },
  ui: {
    theme: 'dark'
  }
});

const validation = validateConfig(config);
if (!validation.isValid) {
  console.error('Configurações inválidas:', validation.errors);
}
*/