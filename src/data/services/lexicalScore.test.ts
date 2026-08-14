import { describe, it, expect } from 'vitest';
import { computeLexicalScore, computeHybridScore, HYBRID_WEIGHT_COSINE, HYBRID_WEIGHT_LEXICAL } from './lexicalScore';

describe('lexicalScore module', () => {
  it('deve calcular score léxico baseado na contagem de termos coincidentes', () => {
    const query = 'insuficiência cardíaca descompensada';
    const contentWithAll = 'O paciente apresenta insuficiência cardíaca crônica descompensada com dispneia.';
    const scoreAll = computeLexicalScore(query, contentWithAll);
    expect(scoreAll).toBe(1.0);

    const contentWithTwo = 'Paciente com insuficiência renal crônica e doença cardíaca.';
    const scoreTwo = computeLexicalScore(query, contentWithTwo);
    // 'insuficiência' e 'cardíaca' (2 de 3 termos da query)
    expect(scoreTwo).toBeCloseTo(2 / 3, 4);

    const contentWithOne = 'Paciente com insuficiência renal pura sem cardiopatia.';
    const scoreOne = computeLexicalScore(query, contentWithOne);
    // 'insuficiência' (1 de 3 termos da query)
    expect(scoreOne).toBeCloseTo(1 / 3, 4);

    const contentWithNone = 'Dor torácica tipo queimação com febre alta.';
    const scoreNone = computeLexicalScore(query, contentWithNone);
    expect(scoreNone).toBe(0.0);
  });

  it('deve ignorar termos muito curtos com menos de 3 caracteres', () => {
    const score = computeLexicalScore('de em a e ou', 'Texto de exemplo em teste com algo');
    expect(score).toBe(0);
  });

  it('deve calcular o score híbrido com pesos 0.7 cosseno + 0.3 léxico', () => {
    const cosSim = 0.8;
    const lexScore = 0.5;
    const hybrid = computeHybridScore(cosSim, lexScore);

    const expected = HYBRID_WEIGHT_COSINE * 0.8 + HYBRID_WEIGHT_LEXICAL * 0.5;
    expect(hybrid).toBeCloseTo(expected, 5);
  });
});
