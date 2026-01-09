/**
 * Rastreador de Sequências
 * Monitora e analisa padrões de sequências de dígitos
 */

class SequenceTracker {
  constructor(logger) {
    this.logger = logger;
    this.reset();
  }

  /**
   * Reset completo das estatísticas
   */
  reset() {
    this.sequenceStats = {
      Under4: {}, // {2: 4, 3: 2, 4: 1} significa: 2 dígitos under 4 consecutivos aconteceu 4 vezes
      Over3: {},
      currentUnder4Sequence: 0,
      currentOver3Sequence: 0,
      totalDigits: 0,
      lastDigit: null
    };
    
    if (this.logger) {
      this.logger.log("Estatísticas de sequência resetadas");
    }
  }

  /**
   * Atualiza estatísticas com novo dígito
   */
  updateSequenceStats(digit) {
    const isUnder4 = digit < 4;
    this.sequenceStats.totalDigits++;
    this.sequenceStats.lastDigit = digit;
    
    if (isUnder4) {
      // Se for under 4
      this.sequenceStats.currentUnder4Sequence++;
      
      // Se tinha sequência de over 3, finaliza e conta
      if (this.sequenceStats.currentOver3Sequence > 0) {
        const count = this.sequenceStats.currentOver3Sequence;
        this.sequenceStats.Over3[count] = (this.sequenceStats.Over3[count] || 0) + 1;
        this.sequenceStats.currentOver3Sequence = 0;
      }
    } else {
      // Se for over 3
      this.sequenceStats.currentOver3Sequence++;
      
      // Se tinha sequência de under 4, finaliza e conta
      if (this.sequenceStats.currentUnder4Sequence > 0) {
        const count = this.sequenceStats.currentUnder4Sequence;
        this.sequenceStats.Under4[count] = (this.sequenceStats.Under4[count] || 0) + 1;
        this.sequenceStats.currentUnder4Sequence = 0;
      }
    }
  }

  /**
   * Gera relatório completo de sequências
   */
  generateSequenceReport() {
    let report = "=== RELATÓRIO DE SEQUÊNCIAS ===\n";
    report += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;
    report += `Total de dígitos analisados: ${this.sequenceStats.totalDigits}\n\n`;
    
    report += "SEQUÊNCIAS DE DÍGITOS UNDER 4:\n";
    const Under4Keys = Object.keys(this.sequenceStats.Under4).sort((a, b) => parseInt(a) - parseInt(b));
    if (Under4Keys.length === 0) {
      report += "Nenhuma sequência de dígitos under 4 registrada ainda.\n";
    } else {
      let totalUnder4 = 0;
      Under4Keys.forEach(length => {
        const count = this.sequenceStats.Under4[length];
        totalUnder4 += count;
        const percentage = this.sequenceStats.totalDigits > 0 ? ((count / this.sequenceStats.totalDigits) * 100).toFixed(2) : 0;
        report += `${length} dígitos under 4 consecutivos: ${count} vezes (${percentage}%)\n`;
      });
      report += `Total de sequências de dígitos under 4: ${totalUnder4}\n`;
    }
    
    report += "\nSEQUÊNCIAS DE DÍGITOS OVER 3:\n";
    const Over3Keys = Object.keys(this.sequenceStats.Over3).sort((a, b) => parseInt(a) - parseInt(b));
    if (Over3Keys.length === 0) {
      report += "Nenhuma sequência de dígitos over 3 registrada ainda.\n";
    } else {
      let totalOver3 = 0;
      Over3Keys.forEach(length => {
        const count = this.sequenceStats.Over3[length];
        totalOver3 += count;
        const percentage = this.sequenceStats.totalDigits > 0 ? ((count / this.sequenceStats.totalDigits) * 100).toFixed(2) : 0;
        report += `${length} dígitos over 3 consecutivos: ${count} vezes (${percentage}%)\n`;
      });
      report += `Total de sequências de dígitos over 3: ${totalOver3}\n`;
    }
    
    report += "\nSEQUÊNCIAS ATUAIS EM ANDAMENTO:\n";
    if (this.sequenceStats.currentUnder4Sequence > 0) {
      report += `Under 4 em andamento: ${this.sequenceStats.currentUnder4Sequence} consecutivos\n`;
    }
    if (this.sequenceStats.currentOver3Sequence > 0) {
      report += `Over 3 em andamento: ${this.sequenceStats.currentOver3Sequence} consecutivos\n`;
    }
    if (this.sequenceStats.currentUnder4Sequence === 0 && this.sequenceStats.currentOver3Sequence === 0) {
      report += "Nenhuma sequência em andamento no momento.\n";
    }
    
    report += "\nANÁLISE ESTATÍSTICA:\n";
    report += this.generateStatisticalAnalysis();
    
    return report;
  }

  /**
   * Gera análise estatística avançada
   */
  generateStatisticalAnalysis() {
    let analysis = "";
    
    // Sequência mais longa
    const longestUnder4 = Math.max(...Object.keys(this.sequenceStats.Under4).map(Number), 0);
    const longestOver3 = Math.max(...Object.keys(this.sequenceStats.Over3).map(Number), 0);
    
    analysis += `Maior sequência de dígitos under 4: ${longestUnder4}\n`;
    analysis += `Maior sequência de dígitos over 3: ${longestOver3}\n`;
    
    // Sequência mais comum
    let mostCommonUnder4Length = 0;
    let mostCommonUnder4Count = 0;
    Object.entries(this.sequenceStats.Under4).forEach(([length, count]) => {
      if (count > mostCommonUnder4Count) {
        mostCommonUnder4Count = count;
        mostCommonUnder4Length = parseInt(length);
      }
    });
    
    let mostCommonOver3Length = 0;
    let mostCommonOver3Count = 0;
    Object.entries(this.sequenceStats.Over3).forEach(([length, count]) => {
      if (count > mostCommonOver3Count) {
        mostCommonOver3Count = count;
        mostCommonOver3Length = parseInt(length);
      }
    });
    
    if (mostCommonUnder4Count > 0) {
      analysis += `Sequência de under 4 mais comum: ${mostCommonUnder4Length} (${mostCommonUnder4Count} vezes)\n`;
    }
    if (mostCommonOver3Count > 0) {
      analysis += `Sequência de over 3 mais comum: ${mostCommonOver3Length} (${mostCommonOver3Count} vezes)\n`;
    }
    
    // Média de sequências
    const avgUnder4Length = this.calculateAverageSequenceLength(this.sequenceStats.Under4);
    const avgOver3Length = this.calculateAverageSequenceLength(this.sequenceStats.Over3);
    
    analysis += `Média de sequência de under 4: ${avgUnder4Length.toFixed(2)}\n`;
    analysis += `Média de sequência de over 3: ${avgOver3Length.toFixed(2)}\n`;
    
    return analysis;
  }

  /**
   * Calcula média de comprimento das sequências
   */
  calculateAverageSequenceLength(sequences) {
    let totalLength = 0;
    let totalSequences = 0;
    
    Object.entries(sequences).forEach(([length, count]) => {
      totalLength += parseInt(length) * count;
      totalSequences += count;
    });
    
    return totalSequences > 0 ? totalLength / totalSequences : 0;
  }

  /**
   * Retorna estatísticas atuais
   */
  getCurrentStats() {
    return {
      totalDigits: this.sequenceStats.totalDigits,
      currentUnder4Sequence: this.sequenceStats.currentUnder4Sequence,
      currentOver3Sequence: this.sequenceStats.currentOver3Sequence,
      lastDigit: this.sequenceStats.lastDigit,
      sequences: {
        Under4: { ...this.sequenceStats.Under4 },
        Over3: { ...this.sequenceStats.Over3 }
      }
    };
  }

  /**
   * Verifica se uma sequência específica já ocorreu
   */
  hasSequenceOccurred(type, length) {
    const sequences = type === 'Under4' ? this.sequenceStats.Under4 : this.sequenceStats.Over3;
    return sequences[length] ? sequences[length] > 0 : false;
  }

  /**
   * Retorna quantas vezes uma sequência específica ocorreu
   */
  getSequenceCount(type, length) {
    const sequences = type === 'Under4' ? this.sequenceStats.Under4 : this.sequenceStats.Over3;
    return sequences[length] || 0;
  }

  /**
   * Prediz próxima possível quebra de sequência
   */
  predictSequenceBreak() {
    const currentUnder4 = this.sequenceStats.currentUnder4Sequence;
    const currentOver3 = this.sequenceStats.currentOver3Sequence;
    
    let prediction = {
      type: null,
      confidence: 0,
      reason: ""
    };

    if (currentUnder4 > 0) {
      // Analisando sequência de under 4 atual
      const historicalBreaks = Object.entries(this.sequenceStats.Under4)
        .filter(([length]) => parseInt(length) >= currentUnder4)
        .reduce((sum, [, count]) => sum + count, 0);
      
      const totalUnder4Sequences = Object.values(this.sequenceStats.Under4)
        .reduce((sum, count) => sum + count, 0);
      
      if (totalUnder4Sequences > 0) {
        prediction.confidence = Math.min(95, (historicalBreaks / totalUnder4Sequences) * 100);
        prediction.type = "Over3";
        prediction.reason = `Sequência atual de ${currentUnder4} dígitos under 4. Histórico sugere quebra.`;
      }
    }

    if (currentOver3 > 0) {
      // Analisando sequência de over 3 atual
      const historicalBreaks = Object.entries(this.sequenceStats.Over3)
        .filter(([length]) => parseInt(length) >= currentOver3)
        .reduce((sum, [, count]) => sum + count, 0);
      
      const totalOver3Sequences = Object.values(this.sequenceStats.Over3)
        .reduce((sum, count) => sum + count, 0);
      
      if (totalOver3Sequences > 0) {
        const confidence = Math.min(95, (historicalBreaks / totalOver3Sequences) * 100);
        if (confidence > prediction.confidence) {
          prediction.confidence = confidence;
          prediction.type = "Under4";
          prediction.reason = `Sequência atual de ${currentOver3} dígitos over 3. Histórico sugere quebra.`;
        }
      }
    }

    return prediction;
  }

  /**
   * Exporta dados de sequência para análise externa
   */
  exportData() {
    return {
      timestamp: new Date().toISOString(),
      totalDigits: this.sequenceStats.totalDigits,
      sequences: {
        Under4: { ...this.sequenceStats.Under4 },
        Over3: { ...this.sequenceStats.Over3 }
      },
      currentState: {
        Under4Sequence: this.sequenceStats.currentUnder4Sequence,
        Over3Sequence: this.sequenceStats.currentOver3Sequence,
        lastDigit: this.sequenceStats.lastDigit
      },
      analysis: {
        avgUnder4Length: this.calculateAverageSequenceLength(this.sequenceStats.Under4),
        avgOver3Length: this.calculateAverageSequenceLength(this.sequenceStats.Over3),
        longestUnder4Sequence: Math.max(...Object.keys(this.sequenceStats.Under4).map(Number), 0),
        longestOver3Sequence: Math.max(...Object.keys(this.sequenceStats.Over3).map(Number), 0)
      }
    };
  }
}

module.exports = SequenceTracker;