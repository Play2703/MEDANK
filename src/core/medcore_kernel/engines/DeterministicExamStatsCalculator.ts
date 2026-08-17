/**
 * DeterministicExamStatsCalculator
 *
 * Módulo determinístico para cálculo de estatísticas reais de bancas/professores a partir de
 * questões extraídas mecanicamente (sem IA), servindo de âncora/calibração empírica sobre o ExamDNA.
 */

import {
  DeterministicExamStats,
  ExamDNA,
  ExtractedExamQuestionRecord,
} from '../../../domain/entities/Question';

export class DeterministicExamStatsCalculator {
  private static readonly VIGNETTE_AGE_REGEX =
    /\b\d{1,3}\s*(?:anos?|meses?|dias?|semanas?)\b/i;

  private static readonly VIGNETTE_PATIENT_REGEX =
    /\b(?:paciente|homem|mulher|lactente|crian[çc]a|idoso|idosa|gestante|primigesta|mult[ií]para|neonato|rec[eé]m-nascido|menino|menina|jovem|adulto|senhor|senhora)\b/i;

  private static readonly VIGNETTE_CLINICAL_REGEX =
    /\b(?:d[aá]\s+entrada|procura|queixando-se|apresenta|atendido|admitido|trazido|internado|ao\s+exame|exame\s+f[ií]sico|laborat[oó]rio|eletrocardiograma|tomografia|radiografia|evoluindo)\b/i;

  private static readonly TRICK_PATTERNS_REGEX =
    /\b(?:EXCETO|INCORRETA?|ERRAD[AO]|N[ÃA]O\s+(?:É|CORRESPONDE|SE\s+APLICA|DEVE|CONSTITUI)|FALS[AO]|ASSINALE\s+A\s+INCORRETA)\b/i;

  /**
   * Calcula estatísticas quantitativas reais a partir de questões extraídas de provas.
   */
  public static calculateStats(
    questions: ExtractedExamQuestionRecord[]
  ): DeterministicExamStats | null {
    if (!questions || questions.length === 0) {
      return null;
    }

    const totalQuestions = questions.length;

    // 1. Distribuição real de gabarito
    const validAnswerQuestions = questions.filter(
      (q) => q.correctLetter && ['A', 'B', 'C', 'D', 'E'].includes(q.correctLetter.toUpperCase())
    );

    const answerCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    for (const q of validAnswerQuestions) {
      const letter = q.correctLetter!.toUpperCase();
      answerCounts[letter] = (answerCounts[letter] || 0) + 1;
    }

    const totalAnswers = validAnswerQuestions.length;
    const answerKeyDistribution: Record<string, number> = {};
    for (const letter of ['A', 'B', 'C', 'D', 'E']) {
      answerKeyDistribution[letter] =
        totalAnswers > 0 ? Math.round((answerCounts[letter] / totalAnswers) * 100) / 100 : 0.2;
    }

    // 2. Extensão média de enunciados
    const totalChars = questions.reduce((sum, q) => sum + (q.statement?.length || 0), 0);
    const totalWords = questions.reduce((sum, q) => {
      const words = (q.statement || '').trim().split(/\s+/).filter(Boolean);
      return sum + words.length;
    }, 0);

    const averageStatementChars = Math.round(totalChars / totalQuestions);
    const averageStatementWords = Math.round(totalWords / totalQuestions);

    // 3. Proporção de vinhetas clínicas (casos clínicos)
    let vignetteCount = 0;
    let trickCount = 0;

    for (const q of questions) {
      const stmt = q.statement || '';

      const hasAge = this.VIGNETTE_AGE_REGEX.test(stmt);
      const hasPatient = this.VIGNETTE_PATIENT_REGEX.test(stmt);
      const hasClinical = this.VIGNETTE_CLINICAL_REGEX.test(stmt);

      // Critério: paciente com idade OU paciente com termo clínico OU idade com termo clínico
      if ((hasAge && hasPatient) || (hasPatient && hasClinical) || (hasAge && hasClinical)) {
        vignetteCount++;
      }

      // Detecção de pegadinhas
      if (this.TRICK_PATTERNS_REGEX.test(stmt)) {
        trickCount++;
      }
    }

    const clinicalVignetteRatio = Math.round((vignetteCount / totalQuestions) * 100) / 100;
    const trickPatternsFrequency = Math.round((trickCount / totalQuestions) * 100) / 100;

    return {
      totalQuestions,
      answerKeyDistribution,
      averageStatementChars,
      averageStatementWords,
      clinicalVignetteRatio,
      trickPatternsFrequency,
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Realiza calibração empírica ancorando o ExamDNA estimado pela IA nos dados determinísticos reais.
   */
  public static anchorExamDNA(
    aiDNA: ExamDNA,
    realStats: DeterministicExamStats
  ): ExamDNA {
    const updatedDNA: ExamDNA = {
      ...aiDNA,
      dataSource: 'ai-anchored-by-real-data',
      deterministicStats: realStats,
      updatedAt: new Date().toISOString(),
    };

    if (aiDNA.clinico) {
      // 1. Ancoragem de contextoClinico (peso 70% determinístico, 30% IA)
      const anchoredContextoClinico =
        0.3 * (aiDNA.clinico.contextoClinico ?? 0.5) + 0.7 * realStats.clinicalVignetteRatio;

      // 2. Ancoragem de casosLongos baseada na contagem real de palavras
      let wordScale = 0.5;
      if (realStats.averageStatementWords < 35) {
        wordScale = 0.25;
      } else if (realStats.averageStatementWords < 65) {
        wordScale = 0.50;
      } else if (realStats.averageStatementWords < 110) {
        wordScale = 0.75;
      } else {
        wordScale = 0.95;
      }

      const anchoredCasosLongos =
        0.3 * (aiDNA.clinico.casosLongos ?? 0.5) + 0.7 * wordScale;

      // 3. Ancoragem de pegadinhas (frequência de pegadinhas reais multiplicada pelo fator de sensibilidade)
      const trickScale = Math.min(1.0, realStats.trickPatternsFrequency * 3.5);
      const anchoredPegadinhas =
        0.4 * (aiDNA.clinico.pegadinhas ?? 0.5) + 0.6 * trickScale;

      updatedDNA.clinico = {
        ...aiDNA.clinico,
        contextoClinico: Math.round(anchoredContextoClinico * 100) / 100,
        casosLongos: Math.round(anchoredCasosLongos * 100) / 100,
        pegadinhas: Math.round(anchoredPegadinhas * 100) / 100,
      };
    }

    return updatedDNA;
  }
}
