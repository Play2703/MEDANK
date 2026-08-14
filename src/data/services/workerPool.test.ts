import { describe, it, expect } from 'vitest';
import { computeSimilaritiesInWorker, SimilarityCandidateInput } from './workerPool';
import { computeHybridScore } from './lexicalScore';

describe('workerPool - Hybrid Vector & Lexical Similarity Calculation', () => {
  it('deve calcular o ranking híbrido (0.7 cosseno + 0.3 léxico) para lista de candidatos com Float32Array', async () => {
    const queryText = 'insuficiência cardíaca descompensada';
    // Vetor de query normalizado (3d)
    const queryVector = new Float32Array([1.0, 0.0, 0.0]);

    const candidates: SimilarityCandidateInput[] = [
      {
        id: 'cand-1',
        content: 'Insuficiência cardíaca com congestão pulmonar e dispneia.',
        vector: new Float32Array([0.9, 0.1, 0.0]), // Cosine ~0.9938 + Lexical (insuficiência, cardíaca) = 2/3 ~0.666
      },
      {
        id: 'cand-2',
        content: 'Insuficiência cardíaca descompensada tratamento intensivo.',
        vector: new Float32Array([0.8, 0.2, 0.0]), // Cosine ~0.9701 + Lexical (todas 3 palavras) = 1.0
      },
      {
        id: 'cand-3',
        content: 'Apendicite aguda cirúrgica com febre.',
        vector: new Float32Array([0.0, 1.0, 0.0]), // Cosine 0.0 + Lexical 0.0 = 0.0
      },
    ];

    const results = await computeSimilaritiesInWorker(queryText, queryVector, candidates, 2);

    expect(results.length).toBe(2);

    // Confirma que os itens retornados possuem cosineScore, lexicalScore e hybridScore calculados
    for (const item of results) {
      expect(item.cosineScore).toBeDefined();
      expect(item.lexicalScore).toBeDefined();
      expect(item.hybridScore).toBeDefined();
      expect(item.hybridScore).toBeCloseTo(
        computeHybridScore(item.cosineScore, item.lexicalScore),
        5
      );
    }

    // O primeiro resultado deve ter maior hybridScore que o segundo
    expect(results[0].hybridScore).toBeGreaterThanOrEqual(results[1].hybridScore);
  });

  it('deve retornar array vazio se não houver candidatos ou vetor de query', async () => {
    const res1 = await computeSimilaritiesInWorker('query', new Float32Array([1, 0]), [], 5);
    expect(res1).toEqual([]);

    const res2 = await computeSimilaritiesInWorker('query', new Float32Array([]), [{ id: '1', content: 'test', vector: [1] }], 5);
    expect(res2).toEqual([]);
  });

});
