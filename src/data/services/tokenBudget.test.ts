import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  estimateTokenCount,
  truncateChunkText,
  pruneChunksByTokenBudget,
  pruneObjectByTokenBudget,
  MAX_CONTEXT_TOKENS_PER_CALL,
  SECONDARY_BATCH_CONTEXT_TOKENS_PER_CALL,
  MAX_TOTAL_PAYLOAD_TOKENS,
} from './tokenBudget';
import { SemanticChunkResult } from './RealSemanticSearchService';
import { ProfessorStyleAnalysis } from '../../domain/entities/Question';

describe('tokenBudget - Full Payload Token Budgeting & Pruning', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('truncateChunkText', () => {
    it('deve retornar texto original se for menor ou igual ao limite (padrão 600 chars)', () => {
      const shortText = 'Insuficiência cardíaca com fração de ejeção reduzida.';
      expect(truncateChunkText(shortText)).toBe(shortText);
    });

    it('deve retornar string vazia para entradas nulas ou vazias', () => {
      expect(truncateChunkText('')).toBe('');
      expect(truncateChunkText(null as any)).toBe('');
      expect(truncateChunkText(undefined as any)).toBe('');
    });

    it('deve truncar textos longos para maxChars com reticências no final', () => {
      const longText = 'A'.repeat(800);
      const truncated = truncateChunkText(longText, 600);
      expect(truncated.length).toBe(601); // 600 chars + '…'
      expect(truncated.endsWith('…')).toBe(true);
    });
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

    it('deve respeitar SECONDARY_BATCH_CONTEXT_TOKENS_PER_CALL (4500) para lotes secundários', () => {
      expect(SECONDARY_BATCH_CONTEXT_TOKENS_PER_CALL).toBe(4500);
      expect(MAX_CONTEXT_TOKENS_PER_CALL).toBe(6000);

      // Criar 15 chunks de 400 tokens cada (total = 6000 tokens)
      const chunks: SemanticChunkResult[] = Array.from({ length: 15 }, (_, i) => ({
        assetId: `asset-${i}`,
        chunkIndex: i,
        content: 'C'.repeat(1600), // 1600 chars = 400 tokens
        similarity: 0.9 - i * 0.01,
      }));

      // No lote principal (6000 tokens), cabem todos os 15 chunks
      const primaryBatch = pruneChunksByTokenBudget(chunks, MAX_CONTEXT_TOKENS_PER_CALL);
      expect(primaryBatch.length).toBe(15);

      // No lote secundário (4500 tokens), cabem no máximo 11 chunks (11 * 400 = 4400 <= 4500)
      const secondaryBatch = pruneChunksByTokenBudget(chunks, SECONDARY_BATCH_CONTEXT_TOKENS_PER_CALL);
      expect(secondaryBatch.length).toBe(11);
    });
  });

  describe('Multi-batch Context Truncation Simulation', () => {
    it('deve manter contexto completo no lote 0 e aplicar truncamento de 600 chars nos lotes 1 e 2', () => {
      const originalChunks: SemanticChunkResult[] = Array.from({ length: 10 }, (_, i) => ({
        assetId: `doc-${i}`,
        chunkIndex: i,
        content: `Diretriz médica detalhada sobre o tema ${i}: `.padEnd(1200, 'X'), // 1200 caracteres cada
        similarity: 0.95 - i * 0.02,
      }));

      // Simulação para 3 lotes (ex: 24 flashcards divididos em 3 lotes de 8)
      const batches = [8, 8, 8].map((qty, batchIdx) => {
        const chunksForBatch = batchIdx === 0
          ? originalChunks
          : pruneChunksByTokenBudget(
              originalChunks.map((c) => ({
                ...c,
                content: truncateChunkText(c.content, 600),
              })),
              SECONDARY_BATCH_CONTEXT_TOKENS_PER_CALL
            );

        return {
          batchIdx,
          qty,
          chunks: chunksForBatch,
          tokens: estimateTokenCount(chunksForBatch),
        };
      });

      // Lote 0: contexto completo
      expect(batches[0].chunks[0].content.length).toBe(1200);
      expect(batches[0].chunks.length).toBe(10);

      // Lotes 1 e 2: truncados para 600 chars + reticências
      expect(batches[1].chunks[0].content.length).toBe(601);
      expect(batches[1].chunks[0].content.endsWith('…')).toBe(true);
      expect(batches[2].chunks[0].content.length).toBe(601);
      expect(batches[2].chunks[0].content.endsWith('…')).toBe(true);

      // Tokens dos lotes secundários devem ser significativamente menores que o lote 0 (~metade)
      expect(batches[1].tokens).toBeLessThan(batches[0].tokens * 0.6);
      expect(batches[2].tokens).toBeLessThan(batches[0].tokens * 0.6);
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

      const budget = 2000;
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
