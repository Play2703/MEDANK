import { describe, it, expect, vi, beforeEach } from 'vitest';
import { questionSimilarityEngine, SIMILARITY_THRESHOLD, MAX_REGENERATION_ATTEMPTS } from './QuestionSimilarityEngine';
import { db } from '../db/database';

vi.mock('../db/database', () => ({
  db: {
    questionEmbeddings: {
      where: vi.fn(),
      put: vi.fn().mockResolvedValue('qemb-1'),
    },
  },
}));

global.fetch = vi.fn();

describe('QuestionSimilarityEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve exportar SIMILARITY_THRESHOLD (0.92) e MAX_REGENERATION_ATTEMPTS (1)', () => {
    expect(SIMILARITY_THRESHOLD).toBe(0.92);
    expect(MAX_REGENERATION_ATTEMPTS).toBe(1);
  });

  it('deve obter o embedding através da API /api/embeddings', async () => {
    const mockEmbedding = [0.1, 0.2, 0.3];
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, embeddings: [mockEmbedding] }),
    });

    const result = await questionSimilarityEngine.getEmbedding('Paciente 45 anos...');
    expect(result).toEqual(mockEmbedding);
  });

  it('deve agrupar requisições em getEmbeddingsBatch() numa única chamada enviando contents: string[]', async () => {
    const mockEmbeddings = [
      [0.1, 0.1, 0.1],
      [0.2, 0.2, 0.2],
      [0.3, 0.3, 0.3],
    ];

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, embeddings: mockEmbeddings }),
    });

    const texts = ['Enunciado 1', 'Enunciado 2', 'Enunciado 3'];
    const results = await questionSimilarityEngine.getEmbeddingsBatch(texts);

    expect(results).toEqual(mockEmbeddings);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(callBody.contents).toEqual(texts);
  });

  it('deve realizar retries com backoff e degradar graciosamente retornando arrays vazios sem lançar exceção ao falhar', async () => {
    // Simula falhas seguidas com HTTP 500
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const texts = ['Texto Q1', 'Texto Q2'];
    const results = await questionSimilarityEngine.getEmbeddingsBatch(texts);

    // Deve ter tentado 1 chamada inicial + 2 retries = 3 chamadas
    expect(global.fetch).toHaveBeenCalledTimes(3);
    // Não deve lançar erro, mas retornar arrays vazios por degradação graciosa
    expect(results).toEqual([[], []]);
  });

  it('deve calcular a similaridade máxima contra candidatos da mesma especialidade/tópico', async () => {
    const mockEmbedding = [1, 0, 0];
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, embeddings: [mockEmbedding] }),
    });

    const candidates = [
      { id: 'qemb-1', questionId: 'q1', specialty: 'Cardiologia', topic: 'IAM', embedding: [1, 0, 0] },
      { id: 'qemb-2', questionId: 'q2', specialty: 'Cardiologia', topic: 'IAM', embedding: [0, 1, 0] },
    ];

    const andMock = { toArray: vi.fn().mockResolvedValueOnce(candidates) };
    const equalsMock = { and: vi.fn().mockReturnValueOnce(andMock) };
    (db.questionEmbeddings.where as any).mockReturnValueOnce({ equals: vi.fn().mockReturnValueOnce(equalsMock) });

    const res = await questionSimilarityEngine.findMaxSimilarity('Paciente com dor torácica...', 'Cardiologia', 'IAM');

    expect(res.maxSimilarity).toBe(1.0);
    expect(res.embedding).toEqual(mockEmbedding);
    expect(db.questionEmbeddings.where).toHaveBeenCalledWith('specialty');
  });

  it('deve registrar embedding da questão aceita no Dexie DB', async () => {
    await questionSimilarityEngine.registerQuestionEmbedding('q123', 'Cardiologia', 'IAM', [0.1, 0.2, 0.3]);
    expect(db.questionEmbeddings.put).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'qemb-q123',
        questionId: 'q123',
        specialty: 'Cardiologia',
        topic: 'IAM',
        embedding: [0.1, 0.2, 0.3],
      })
    );
  });
});
