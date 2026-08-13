import { describe, it, expect } from 'vitest';
import { levenshteinDistance, isTypoMatch } from './levenshtein';

describe('Levenshtein Distance Utility', () => {
  it('deve retornar 0 para strings idênticas', () => {
    expect(levenshteinDistance('musculo', 'musculo')).toBe(0);
    expect(levenshteinDistance('diabetes', 'diabetes')).toBe(0);
  });

  it('deve calcular distância 1 para substituição simples', () => {
    expect(levenshteinDistance('musculo', 'musculu')).toBe(1);
    expect(levenshteinDistance('hipertensao', 'hypertensao')).toBe(1);
  });

  it('deve calcular distância 1 para inserção e remoção', () => {
    expect(levenshteinDistance('asma', 'asmar')).toBe(1);
    expect(levenshteinDistance('infarto', 'infart')).toBe(1);
  });

  it('deve calcular distância 2 para pequenos erros de digitação (typos)', () => {
    expect(levenshteinDistance('pneumonia', 'pneunomia')).toBe(2);
    expect(levenshteinDistance('cefaleia', 'cefaleya')).toBe(1);
  });

  it('deve retornar > maxThreshold rapidamente para palavras muito distintas', () => {
    expect(levenshteinDistance('asma', 'hipertensao', 2)).toBeGreaterThan(2);
    expect(levenshteinDistance('captopril', 'amiodarona', 2)).toBeGreaterThan(2);
  });

  it('deve validar match tolerante com isTypoMatch', () => {
    expect(isTypoMatch('musculu', 'musculo', 2)).toBe(true);
    expect(isTypoMatch('cefaleya', 'cefaleia', 2)).toBe(true);
    expect(isTypoMatch('asma', 'has', 2)).toBe(false);
  });
});
