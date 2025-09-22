/**
 * Sistema de Logs
 * Centraliza toda a funcionalidade de logging do sistema
 */

class Logger {
  constructor(socketIO) {
    this.io = socketIO;
    this.systemLogs = []; // Array para armazenar todos os logs
    this.maxLogs = 1000; // Máximo de logs na memória
  }

  /**
   * Registra uma nova mensagem de log
   */
  log(message, type = "info") {
    const logObj = {
      message,
      type,
      category: "general",
      timestamp: new Date().toLocaleTimeString(),
      fullTimestamp: new Date().toISOString(),
    };
    
    // Armazenar no array de logs
    this.systemLogs.push(logObj);
    
    // Manter apenas os últimos logs na memória
    if (this.systemLogs.length > this.maxLogs) {
      this.systemLogs.shift();
    }
    
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Emitir para clientes conectados
    if (this.io) {
      this.io.emit("newLog", logObj);
    }
  }

  /**
   * Log específico para trades
   */
  logTrade(message, type = "info") {
    const logObj = {
      message,
      type,
      category: "trade",
      timestamp: new Date().toLocaleTimeString(),
      fullTimestamp: new Date().toISOString(),
    };
    
    this.systemLogs.push(logObj);
    
    if (this.systemLogs.length > this.maxLogs) {
      this.systemLogs.shift();
    }
    
    console.log(`[TRADE-${type.toUpperCase()}] ${message}`);
    
    if (this.io) {
      this.io.emit("newLog", logObj);
    }
  }

  /**
   * Log específico para estratégias
   */
  logStrategy(message, strategyName, type = "info") {
    const logObj = {
      message: `[${strategyName}] ${message}`,
      type,
      category: "strategy",
      timestamp: new Date().toLocaleTimeString(),
      fullTimestamp: new Date().toISOString(),
    };
    
    this.systemLogs.push(logObj);
    
    if (this.systemLogs.length > this.maxLogs) {
      this.systemLogs.shift();
    }
    
    console.log(`[STRATEGY-${type.toUpperCase()}] [${strategyName}] ${message}`);
    
    if (this.io) {
      this.io.emit("newLog", logObj);
    }
  }

  /**
   * Log de erro com stack trace opcional
   */
  logError(message, error = null) {
    let fullMessage = message;
    
    if (error && error.stack) {
      fullMessage += `\nStack: ${error.stack}`;
    }
    
    this.log(fullMessage, "error");
  }

  /**
   * Log de sucesso
   */
  logSuccess(message) {
    this.log(message, "success");
  }

  /**
   * Log de warning
   */
  logWarning(message) {
    this.log(message, "warning");
  }

  /**
   * Log de debug (só aparece em modo debug)
   */
  logDebug(message, debugMode = false) {
    if (debugMode) {
      this.log(`[DEBUG] ${message}`, "debug");
    }
  }

  /**
   * Gera relatório completo de logs
   */
  generateFullLogReport() {
    let report = "=== RELATÓRIO COMPLETO DE LOGS ===\n";
    report += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;
    report += `Total de logs: ${this.systemLogs.length}\n\n`;
    
    this.systemLogs.forEach(logEntry => {
      const timestamp = new Date(logEntry.fullTimestamp).toLocaleString('pt-BR');
      report += `[${logEntry.type.toUpperCase()}] [${logEntry.category.toUpperCase()}] ${timestamp} - ${logEntry.message}\n`;
    });
    
    return report;
  }

  /**
   * Gera relatório apenas de trades
   */
  generateTradeReport() {
    const tradeLogs = this.systemLogs.filter(log => log.category === "trade");
    
    let report = "=== RELATÓRIO DE TRADES ===\n";
    report += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;
    report += `Total de logs de trade: ${tradeLogs.length}\n\n`;
    
    tradeLogs.forEach(logEntry => {
      const timestamp = new Date(logEntry.fullTimestamp).toLocaleString('pt-BR');
      report += `[${logEntry.type.toUpperCase()}] ${timestamp} - ${logEntry.message}\n`;
    });
    
    return report;
  }

  /**
   * Gera relatório por categoria
   */
  generateCategoryReport(category) {
    const categoryLogs = this.systemLogs.filter(log => log.category === category);
    
    let report = `=== RELATÓRIO - ${category.toUpperCase()} ===\n`;
    report += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;
    report += `Total de logs: ${categoryLogs.length}\n\n`;
    
    categoryLogs.forEach(logEntry => {
      const timestamp = new Date(logEntry.fullTimestamp).toLocaleString('pt-BR');
      report += `[${logEntry.type.toUpperCase()}] ${timestamp} - ${logEntry.message}\n`;
    });
    
    return report;
  }

  /**
   * Gera relatório por tipo (info, error, warning, etc)
   */
  generateTypeReport(type) {
    const typeLogs = this.systemLogs.filter(log => log.type === type);
    
    let report = `=== RELATÓRIO - ${type.toUpperCase()} ===\n`;
    report += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;
    report += `Total de logs: ${typeLogs.length}\n\n`;
    
    typeLogs.forEach(logEntry => {
      const timestamp = new Date(logEntry.fullTimestamp).toLocaleString('pt-BR');
      report += `[${logEntry.category.toUpperCase()}] ${timestamp} - ${logEntry.message}\n`;
    });
    
    return report;
  }

  /**
   * Gera estatísticas dos logs
   */
  getLogStats() {
    const stats = {
      total: this.systemLogs.length,
      byType: {},
      byCategory: {},
      recent: this.systemLogs.slice(-10) // Últimos 10 logs
    };

    this.systemLogs.forEach(log => {
      // Contar por tipo
      stats.byType[log.type] = (stats.byType[log.type] || 0) + 1;
      
      // Contar por categoria
      stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
    });

    return stats;
  }

  /**
   * Limpa todos os logs
   */
  clearLogs() {
    this.systemLogs = [];
    this.log("Logs limpos pelo usuário");
  }

  /**
   * Remove logs mais antigos que X dias
   */
  cleanOldLogs(days = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const initialCount = this.systemLogs.length;
    this.systemLogs = this.systemLogs.filter(log => {
      const logDate = new Date(log.fullTimestamp);
      return logDate > cutoffDate;
    });

    const removedCount = initialCount - this.systemLogs.length;
    this.log(`Limpeza automática: ${removedCount} logs antigos removidos (>${days} dias)`);
  }

  /**
   * Exporta logs em formato JSON
   */
  exportLogsJSON() {
    return JSON.stringify(this.systemLogs, null, 2);
  }

  /**
   * Importa logs de um JSON
   */
  importLogsJSON(jsonData) {
    try {
      const importedLogs = JSON.parse(jsonData);
      if (Array.isArray(importedLogs)) {
        this.systemLogs = [...this.systemLogs, ...importedLogs];
        
        // Manter limite de logs
        if (this.systemLogs.length > this.maxLogs) {
          this.systemLogs = this.systemLogs.slice(-this.maxLogs);
        }
        
        this.log(`${importedLogs.length} logs importados com sucesso`);
        return true;
      }
    } catch (error) {
      this.logError("Erro ao importar logs", error);
      return false;
    }
  }
}

module.exports = Logger;