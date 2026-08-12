import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from './cosineSimilarity';

describe('cosineSimilarity', () => {
  it('deve retornar 1 para vetores idênticos', () => {
    const vecA = [1, 2, 3, 4];
    const vecB = [1, 2, 3, 4];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0, 5);
  });

  it('deve retornar 0 para vetores ortogonais', () => {
    const vecA = [1, 0];
    const vecB = [0, 1];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0.0, 5);
  });

  it('deve retornar 0 para vetores de tamanhos diferentes', () => {
    const vecA = [1, 2, 3];
    const vecB = [1, 2];
    expect(cosineSimilarity(vecA, vecB)).toBe(0);
  });

  it('deve retornar 0 para vetores vazios', () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [])).toBe(0);
  });
});
