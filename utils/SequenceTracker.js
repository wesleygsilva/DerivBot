/**
 * Rastreador de Sequências
 * Monitora e analisa padrões de sequências de dígitos pares/ímpares
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
      Even: {}, // {2: 4, 3: 2, 4: 1} significa: 2 pares consecutivos aconteceu 4 vezes
      Odd: {},
      currentEvenSequence: 0,
      currentOddSequence: 0,
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
    const isEven = digit % 2 === 0;
    this.sequenceStats.totalDigits++;
    this.sequenceStats.lastDigit = digit;
    
    if (isEven) {
      // Se for par
      this.sequenceStats.currentEvenSequence++;
      
      // Se tinha sequência de ímpares, finaliza e conta
      if (this.sequenceStats.currentOddSequence > 0) {
        const count = this.sequenceStats.currentOddSequence;
        this.sequenceStats.Odd[count] = (this.sequenceStats.Odd[count] || 0) + 1;
        this.sequenceStats.currentOddSequence = 0;
      }
    } else {
      // Se for ímpar
      this.sequenceStats.currentOddSequence++;
      
      // Se tinha sequência de pares, finaliza e conta
      if (this.sequenceStats.currentEvenSequence > 0) {
        const count = this.sequenceStats.currentEvenSequence;
        this.sequenceStats.Even[count] = (this.sequenceStats.Even[count] || 0) + 1;
        this.sequenceStats.currentEvenSequence = 0;
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
    
    report += "SEQUÊNCIAS DE DÍGITOS PARES:\n";
    const EvenKeys = Object.keys(this.sequenceStats.Even).sort((a, b) => parseInt(a) - parseInt(b));
    if (EvenKeys.length === 0) {
      report += "Nenhuma sequência de pares registrada ainda.\n";
    } else {
      let totalEven = 0;
      EvenKeys.forEach(length => {
        const count = this.sequenceStats.Even[length];
        totalEven += count;
        const percentage = this.sequenceStats.totalDigits > 0 ? ((count / this.sequenceStats.totalDigits) * 100).toFixed(2) : 0;
        report += `${length} pares consecutivos: ${count} vezes (${percentage}%)\n`;
      });
      report += `Total de sequências de pares: ${totalEven}\n`;
    }
    
    report += "\nSEQUÊNCIAS DE DÍGITOS ÍMPARES:\n";
    const OddKeys = Object.keys(this.sequenceStats.Odd).sort((a, b) => parseInt(a) - parseInt(b));
    if (OddKeys.length === 0) {
      report += "Nenhuma sequência de ímpares registrada ainda.\n";
    } else {
      let totalOdd = 0;
      OddKeys.forEach(length => {
        const count = this.sequenceStats.Odd[length];
        totalOdd += count;
        const percentage = this.sequenceStats.totalDigits > 0 ? ((count / this.sequenceStats.totalDigits) * 100).toFixed(2) : 0;
        report += `${length} ímpares consecutivos: ${count} vezes (${percentage}%)\n`;
      });
      report += `Total de sequências de ímpares: ${totalOdd}\n`;
    }
    
    report += "\nSEQUÊNCIAS ATUAIS EM ANDAMENTO:\n";
    if (this.sequenceStats.currentEvenSequence > 0) {
      report += `Pares em andamento: ${this.sequenceStats.currentEvenSequence} consecutivos\n`;
    }
    if (this.sequenceStats.currentOddSequence > 0) {
      report += `Ímpares em andamento: ${this.sequenceStats.currentOddSequence} consecutivos\n`;
    }
    if (this.sequenceStats.currentEvenSequence === 0 && this.sequenceStats.currentOddSequence === 0) {
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
    const longestEven = Math.max(...Object.keys(this.sequenceStats.Even).map(Number), 0);
    const longestOdd = Math.max(...Object.keys(this.sequenceStats.Odd).map(Number), 0);
    
    analysis += `Maior sequência de pares: ${longestEven}\n`;
    analysis += `Maior sequência de ímpares: ${longestOdd}\n`;
    
    // Sequência mais comum
    let mostCommonEvenLength = 0;
    let mostCommonEvenCount = 0;
    Object.entries(this.sequenceStats.Even).forEach(([length, count]) => {
      if (count > mostCommonEvenCount) {
        mostCommonEvenCount = count;
        mostCommonEvenLength = parseInt(length);
      }
    });
    
    let mostCommonOddLength = 0;
    let mostCommonOddCount = 0;
    Object.entries(this.sequenceStats.Odd).forEach(([length, count]) => {
      if (count > mostCommonOddCount) {
        mostCommonOddCount = count;
        mostCommonOddLength = parseInt(length);
      }
    });
    
    if (mostCommonEvenCount > 0) {
      analysis += `Sequência de pares mais comum: ${mostCommonEvenLength} (${mostCommonEvenCount} vezes)\n`;
    }
    if (mostCommonOddCount > 0) {
      analysis += `Sequência de ímpares mais comum: ${mostCommonOddLength} (${mostCommonOddCount} vezes)\n`;
    }
    
    // Média de sequências
    const avgEvenLength = this.calculateAverageSequenceLength(this.sequenceStats.Even);
    const avgOddLength = this.calculateAverageSequenceLength(this.sequenceStats.Odd);
    
    analysis += `Média de sequência de pares: ${avgEvenLength.toFixed(2)}\n`;
    analysis += `Média de sequência de ímpares: ${avgOddLength.toFixed(2)}\n`;
    
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
      currentEvenSequence: this.sequenceStats.currentEvenSequence,
      currentOddSequence: this.sequenceStats.currentOddSequence,
      lastDigit: this.sequenceStats.lastDigit,
      sequences: {
        Even: { ...this.sequenceStats.Even },
        Odd: { ...this.sequenceStats.Odd }
      }
    };
  }

  /**
   * Verifica se uma sequência específica já ocorreu
   */
  hasSequenceOccurred(type, length) {
    const sequences = type === 'Even' ? this.sequenceStats.Even : this.sequenceStats.Odd;
    return sequences[length] ? sequences[length] > 0 : false;
  }

  /**
   * Retorna quantas vezes uma sequência específica ocorreu
   */
  getSequenceCount(type, length) {
    const sequences = type === 'Even' ? this.sequenceStats.Even : this.sequenceStats.Odd;
    return sequences[length] || 0;
  }

  /**
   * Prediz próxima possível quebra de sequência
   */
  predictSequenceBreak() {
    const currentEven = this.sequenceStats.currentEvenSequence;
    const currentOdd = this.sequenceStats.currentOddSequence;
    
    let prediction = {
      type: null,
      confidence: 0,
      reason: ""
    };

    if (currentEven > 0) {
      // Analisando sequência de pares atual
      const historicalBreaks = Object.entries(this.sequenceStats.Even)
        .filter(([length]) => parseInt(length) >= currentEven)
        .reduce((sum, [, count]) => sum + count, 0);
      
      const totalEvenSequences = Object.values(this.sequenceStats.Even)
        .reduce((sum, count) => sum + count, 0);
      
      if (totalEvenSequences > 0) {
        prediction.confidence = Math.min(95, (historicalBreaks / totalEvenSequences) * 100);
        prediction.type = "Odd";
        prediction.reason = `Sequência atual de ${currentEven} pares. Histórico sugere quebra.`;
      }
    }

    if (currentOdd > 0) {
      // Analisando sequência de ímpares atual
      const historicalBreaks = Object.entries(this.sequenceStats.Odd)
        .filter(([length]) => parseInt(length) >= currentOdd)
        .reduce((sum, [, count]) => sum + count, 0);
      
      const totalOddSequences = Object.values(this.sequenceStats.Odd)
        .reduce((sum, count) => sum + count, 0);
      
      if (totalOddSequences > 0) {
        const confidence = Math.min(95, (historicalBreaks / totalOddSequences) * 100);
        if (confidence > prediction.confidence) {
          prediction.confidence = confidence;
          prediction.type = "Even";
          prediction.reason = `Sequência atual de ${currentOdd} ímpares. Histórico sugere quebra.`;
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
        Even: { ...this.sequenceStats.Even },
        Odd: { ...this.sequenceStats.Odd }
      },
      currentState: {
        EvenSequence: this.sequenceStats.currentEvenSequence,
        OddSequence: this.sequenceStats.currentOddSequence,
        lastDigit: this.sequenceStats.lastDigit
      },
      analysis: {
        avgEvenLength: this.calculateAverageSequenceLength(this.sequenceStats.Even),
        avgOddLength: this.calculateAverageSequenceLength(this.sequenceStats.Odd),
        longestEvenSequence: Math.max(...Object.keys(this.sequenceStats.Even).map(Number), 0),
        longestOddSequence: Math.max(...Object.keys(this.sequenceStats.Odd).map(Number), 0)
      }
    };
  }
}

module.exports = SequenceTracker;