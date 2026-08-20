import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ExamPDFQuestionSplitter } from './ExamPDFQuestionSplitter';

export const OFFICIAL_ANSWER_KEY: Record<number, string> = {
  1: 'D', 2: 'D', 3: 'C', 4: 'D', 5: 'B', 6: 'E', 7: 'A', 8: 'A', 9: 'D', 10: 'A',
  11: 'D', 12: 'D', 13: 'A', 14: 'A', 15: 'A', 16: 'A', 17: 'C', 18: 'B', 19: '', 20: 'A',
  21: 'D', 22: 'B', 23: 'E', 24: 'B', 25: 'C', 26: 'B', 27: 'A', 28: 'B', 29: 'C', 30: 'C',
  31: 'A', 32: 'C', 33: 'D', 34: 'B', 35: 'A', 36: 'A', 37: 'D', 38: 'D', 39: 'D', 40: 'A',
  41: 'C', 42: 'C', 43: 'C', 44: 'C', 45: 'B', 46: 'D', 47: 'B', 48: 'B', 49: 'E', 50: 'B',
  51: 'C', 52: 'A', 53: 'A', 54: 'C', 55: 'B', 56: 'C', 57: 'B', 58: 'C', 59: 'D', 60: 'B',
  61: 'A', 62: 'E', 63: 'A', 64: 'B', 65: 'B', 66: 'D', 67: 'B', 68: 'C', 69: 'E', 70: 'C',
  71: 'D', 72: 'D', 73: 'B', 74: 'D', 75: 'C', 76: 'A', 77: 'C', 78: 'C', 79: 'D', 80: 'B',
  81: 'D', 82: 'C', 83: 'B', 84: 'D', 85: 'D', 86: 'C', 87: 'C', 88: 'A', 89: 'B', 90: 'A',
  91: 'C', 92: 'B', 93: 'A', 94: 'D', 95: 'C', 96: 'B', 97: 'D', 98: 'A', 99: 'A', 100: 'D'
};

export const EXPECTED_OPTIONS_COUNT: Record<number, number> = {
  1: 5, 2: 4, 3: 5, 4: 4, 5: 4, 6: 5, 7: 4, 8: 4, 9: 4, 10: 4,
  11: 5, 12: 4, 13: 4, 14: 5, 15: 5, 16: 4, 17: 4, 18: 5, 19: 0, 20: 4,
  21: 5, 22: 4, 23: 5, 24: 5, 25: 4, 26: 4, 27: 4, 28: 4, 29: 5, 30: 4,
  31: 4, 32: 4, 33: 4, 34: 4, 35: 4, 36: 4, 37: 4, 38: 4, 39: 5, 40: 5,
  41: 5, 42: 4, 43: 4, 44: 5, 45: 5, 46: 5, 47: 4, 48: 5, 49: 5, 50: 5,
  51: 4, 52: 4, 53: 2, 54: 4, 55: 4, 56: 4, 57: 4, 58: 5, 59: 4, 60: 5,
  61: 4, 62: 5, 63: 5, 64: 5, 65: 5, 66: 4, 67: 4, 68: 4, 69: 5, 70: 4,
  71: 4, 72: 4, 73: 4, 74: 4, 75: 4, 76: 5, 77: 4, 78: 4, 79: 4, 80: 4,
  81: 5, 82: 4, 83: 4, 84: 4, 85: 4, 86: 4, 87: 4, 88: 5, 89: 4, 90: 4,
  91: 5, 92: 4, 93: 4, 94: 5, 95: 5, 96: 5, 97: 4, 98: 5, 99: 4, 100: 5
};

describe('ExamAcceptancePDF100Clinica - Regressão e Aceitação Completa', () => {
  const fixturePath = path.resolve(__dirname, '../fixtures/prova_100_clinica_ocr.json');
  const ocrPages = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  it('deve segmentar todas as 100 questões do PDF de aceitação', () => {
    const result = ExamPDFQuestionSplitter.splitFromOCR(ocrPages);

    expect(result.success).toBe(true);
    expect(result.totalQuestions).toBe(100);
  });

  it('deve atingir >= 95% de questões com confiança diferente de "low"', () => {
    const result = ExamPDFQuestionSplitter.splitFromOCR(ocrPages);

    const nonLowCount = (result.highConfidenceCount || 0) + (result.mediumConfidenceCount || 0);
    const nonLowRatio = nonLowCount / result.totalQuestions;

    expect(nonLowRatio).toBeGreaterThanOrEqual(0.95);
    expect(result.lowConfidenceRatio).toBeLessThanOrEqual(0.05);
  });

  it('deve extrair exatamente o número correto de alternativas não vazias para todas as 99 questões de múltipla escolha', () => {
    const result = ExamPDFQuestionSplitter.splitFromOCR(ocrPages);

    for (const q of result.questions) {
      const expCount = EXPECTED_OPTIONS_COUNT[q.questionNumber];
      expect(q.options.length).toBe(expCount);

      if (q.questionNumber !== 19) {
        // Todas as alternativas devem ter texto não vazio
        for (const opt of q.options) {
          expect(opt.text.trim().length).toBeGreaterThan(0);
        }

        // Não deve haver duplicação de texto idêntico entre alternativas da mesma questão
        const texts = q.options.map((o) => o.text.trim().toLowerCase());
        const uniqueTexts = new Set(texts);
        expect(uniqueTexts.size).toBe(texts.length);
      }
    }
  });

  it('deve conter a alternativa correta oficial para cada questão de múltipla escolha', () => {
    const result = ExamPDFQuestionSplitter.splitFromOCR(ocrPages);

    for (const q of result.questions) {
      const expectedLetter = OFFICIAL_ANSWER_KEY[q.questionNumber];
      if (expectedLetter) {
        const correctOpt = q.options.find((o) => o.letter === expectedLetter);
        expect(correctOpt).toBeDefined();
        expect(correctOpt?.text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('deve resolver o caso crítico da Q68 isolando 4 alternativas com precisão', () => {
    const result = ExamPDFQuestionSplitter.splitFromOCR(ocrPages);
    const q68 = result.questions.find((q) => q.questionNumber === 68);

    expect(q68).toBeDefined();
    expect(q68?.options.length).toBe(4);
    expect(q68?.confidence).not.toBe('low');
    expect(q68?.options.map((o) => o.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(q68?.options[2].letter).toBe('C');
    expect(q68?.options[2].text).toContain('discos voadores');
  });

  it('deve tratar a questão Q53 (Certo/Errado) com 2 alternativas com confiança adequada', () => {
    const result = ExamPDFQuestionSplitter.splitFromOCR(ocrPages);
    const q53 = result.questions.find((q) => q.questionNumber === 53);

    expect(q53).toBeDefined();
    expect(q53?.options.length).toBe(2);
    expect(q53?.confidence).toBe('high');
    expect(q53?.options[0].text).toContain('CERTO');
    expect(q53?.options[1].text).toContain('ERRADO');
  });
});
