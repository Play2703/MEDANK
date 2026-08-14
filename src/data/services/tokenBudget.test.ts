import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  estimateTokenCount,
  pruneChunksByTokenBudget,
  pruneObjectByTokenBudget,
  MAX_CONTEXT_TOKENS_PER_CALL,
  MAX_TOTAL_PAYLOAD_TOKENS,
} from './tokenBudget';
import { SemanticChunkResult } from './RealSemanticSearchService';
import { ProfessorStyleAnalysis } from '../../domain/entities/Question';

describe('tokenBudget - Full Payload Token Budgeting & Pruning', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('estimateTokenCount', () => {
    it('deve estimar 0 tokens para entradas nulas, indefinidas ou vazias', () => {
      expect(estimateTokenCount(null)).toBe(0);
      expect(estimateTokenCount(undefined)).toBe(0);
      expect(estimateTokenCount('')).toBe(0);
    });

    it('deve estimar ~1 token a cada 4 caracteres para strings', () => {
      const text = '12345678'; // 8 chars -> 2 tokens
      expect(estimateTokenCount(text)).toBe(2);
    });

    it('deve estimar tokens para objetos e arrays via JSON.stringify', () => {
      const obj = { key: 'value' };
      const tokens = estimateTokenCount(obj);
      expect(tokens).toBeGreaterThan(0);
    });
  });

  describe('pruneChunksByTokenBudget', () => {
    it('deve manter todos os chunks se estiverem dentro do orçamento', () => {
      const chunks: SemanticChunkResult[] = [
        { assetId: 'a1', chunkIndex: 0, content: 'Texto curto de cardiologia', similarity: 0.9 },
        { assetId: 'a1', chunkIndex: 1, content: 'Outro texto curto', similarity: 0.8 },
      ];

      const pruned = pruneChunksByTokenBudget(chunks, 1000);
      expect(pruned.length).toBe(2);
    });

    it('deve podar chunks excedentes preservando os primeiros mais relevantes', () => {
      const longContent = 'A'.repeat(400); // 100 tokens
      const chunks: SemanticChunkResult[] = [
        { assetId: 'a1', chunkIndex: 0, content: longContent, similarity: 0.95 },
        { assetId: 'a1', chunkIndex: 1, content: longContent, similarity: 0.85 },
        { assetId: 'a1', chunkIndex: 2, content: longContent, similarity: 0.75 },
      ];

      // Orçamento de 150 tokens permite o 1º chunk (100 tokens), mas não o 2º (100 + 100 > 150)
      const pruned = pruneChunksByTokenBudget(chunks, 150);
      expect(pruned.length).toBe(1);
      expect(pruned[0].chunkIndex).toBe(0);
    });
  });

  describe('pruneObjectByTokenBudget', () => {
    it('não deve alterar nem cortar nada no caso normal (payload pequeno dentro do orçamento)', () => {
      const normalPayload = {
        retrievedChunks: [
          { assetId: 'a1', chunkIndex: 0, content: 'Resumo sobre Insuficiência Cardíaca.', similarity: 0.9 },
        ],
        specialty: 'Cardiologia',
        topics: ['Insuficiência Cardíaca'],
        quantity: 5,
        difficulty: 'media',
        distractorHints: [{ text: 'Furosemida', source: 'grafo' }],
        professorStyleAnalysis: {
          temasFavoritos: ['IC'],
          pegadinhasRecorrentes: ['Troca de IECA por BRA'],
          resumoEstiloGeral: 'Focado em raciocínio clínico.',
        },
      };

      const result = pruneObjectByTokenBudget(normalPayload, MAX_TOTAL_PAYLOAD_TOKENS);
      expect(result).toEqual(normalPayload);
      expect(result.retrievedChunks.length).toBe(1);
      expect(result.distractorHints.length).toBe(1);
    });

    it('deve podar professorStyleAnalysis artificialmente grande abaixo do orçamento SEM cortar os retrievedChunks quando não for necessário', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // 500 pegadinhas e 500 temas favoritos geram um objeto com dezenas de milhares de caracteres (> 10.000 tokens)
      const massivePegadinhas = Array.from({ length: 500 }, (_, i) => `Pegadinha recorrente de prova número ${i}: confunde diagnóstico diferencial com detalhes minuciosos`);
      const massiveTemas = Array.from({ length: 500 }, (_, i) => `Tema favorito número ${i}: fisiopatologia detalhada`);

      const bigProfessorAnalysis: ProfessorStyleAnalysis = {
        temasFavoritos: massiveTemas,
        estiloDeQuestao: 'Casos longos',
        nivelCognitivo: 'Aplicação',
        pegadinhasRecorrentes: massivePegadinhas,
        resumoEstiloGeral: 'Professor rigoroso que foca em pegadinhas conceituais.',
      };

      const initialChunks: SemanticChunkResult[] = [
        { assetId: 'a1', chunkIndex: 0, content: 'Diretriz Brasileira de Insuficiência Cardíaca 2023.', similarity: 0.95 },
        { assetId: 'a1', chunkIndex: 1, content: 'Critérios de Framingham para diagnóstico de IC.', similarity: 0.90 },
      ];

      const bigPayload = {
        retrievedChunks: initialChunks,
        specialty: 'Cardiologia',
        topics: ['Insuficiência Cardíaca'],
        quantity: 5,
        professorStyleAnalysis: bigProfessorAnalysis,
        distractorHints: [{ text: 'Digoxina', source: 'grafo' }],
      };

      const budget = 2000; // Limite restrito para forçar poda
      const initialTokens = estimateTokenCount(bigPayload);
      expect(initialTokens).toBeGreaterThan(budget);

      const prunedPayload = pruneObjectByTokenBudget(bigPayload, budget);

      const finalTokens = estimateTokenCount(prunedPayload);
      expect(finalTokens).toBeLessThanOrEqual(budget);

      // Os chunks essenciais NÃO devem ter sido cortados porque a poda do professorStyleAnalysis foi suficiente
      expect(prunedPayload.retrievedChunks.length).toBe(2);

      // O professorStyleAnalysis foi podado
      expect(prunedPayload.professorStyleAnalysis.pegadinhasRecorrentes.length).toBeLessThan(500);

      // Confirma que console.warn foi disparado informando a poda
      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[TokenBudget] Total payload exceeded budget'));
    });

    it('deve podar retrievedChunks como último recurso se o payload ainda exceder o orçamento após podar metadados', () => {
      const massiveChunks: SemanticChunkResult[] = Array.from({ length: 20 }, (_, i) => ({
        assetId: `asset-${i}`,
        chunkIndex: 0,
        content: `Parágrafo científico detalhado número ${i} com extensa descrição fisiopatológica `.repeat(20),
        similarity: 0.9 - i * 0.02,
      }));

      const payload = {
        retrievedChunks: massiveChunks,
        specialty: 'Nefrologia',
        topics: ['Glomerulonefrite'],
        distractorHints: Array.from({ length: 15 }, (_, i) => ({ text: `Distrator ${i}`, source: 'grafo' })),
      };

      const budget = 500;
      const pruned = pruneObjectByTokenBudget(payload, budget);

      expect(estimateTokenCount(pruned)).toBeLessThanOrEqual(budget);
      expect(pruned.retrievedChunks.length).toBeLessThan(massiveChunks.length);
      expect(pruned.retrievedChunks.length).toBeGreaterThanOrEqual(1);
    });
  });
});
