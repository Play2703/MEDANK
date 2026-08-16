import { db } from '../db/database';
import { cosineSimilarity } from './cosineSimilarity';
import { apiUrl } from '../../lib/apiBaseUrl';

/**
 * Configuração de Limiares de Similaridade Semântica e Regeneração de Questões
 * 
 * Atualizado em 16/08/2026:
 * - SIMILARITY_THRESHOLD elevado de 0.88 para 0.92: reduz disparo excessivo de regenerações
 *   aceitando pequenas variações semânticas legítimas entre questões clínicas correlatas.
 * - MAX_REGENERATION_ATTEMPTS reduzido de 2 para 1: evita cascata de chamadas de IA,
 *   otimizando latência e consumo de tokens por sessão de estudo.
 */
const SIMILARITY_THRESHOLD = 0.92;
const MAX_REGENERATION_ATTEMPTS = 1;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2,
  backoffMs = typeof process !== 'undefined' && process.env.NODE_ENV === 'test' ? 10 : 800
): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      attempt++;
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (attempt > retries) return res;
    } catch (err) {
      if (attempt > retries) throw err;
    }
    const delayMs = backoffMs * Math.pow(2, attempt - 1);
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

export class QuestionSimilarityEngine {
  /**
   * Envia múltiplos textos em lote numa única requisição para /api/embeddings.
   */
  async getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) return [];

    try {
      const res = await fetchWithRetry(
        apiUrl('/api/embeddings'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: texts }),
        },
        2,
        800
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      if (data.embeddings && Array.isArray(data.embeddings)) {
        return data.embeddings;
      }
      if (data.embedding && Array.isArray(data.embedding)) {
        return [data.embedding];
      }
      return texts.map(() => []);
    } catch (err) {
      console.warn(
        `[QuestionSimilarityEngine] Embedding indisponível para o lote (${texts.length} textos) — pulando checagem de similaridade:`,
        err
      );
      return texts.map(() => []);
    }
  }

  async getEmbedding(text: string): Promise<number[]> {
    const batch = await this.getEmbeddingsBatch([text]);
    return batch[0] || [];
  }

  /**
   * Verifica se um enunciado de questão é muito similar a alguma questão já
   * existente na mesma especialidade/tópico. Retorna a maior similaridade encontrada.
   */
  async findMaxSimilarity(
    statement: string,
    specialty: string,
    topic: string,
    preCalculatedEmbedding?: number[]
  ): Promise<{ maxSimilarity: number; embedding: number[] }> {
    try {
      const embedding =
        preCalculatedEmbedding && preCalculatedEmbedding.length > 0
          ? preCalculatedEmbedding
          : await this.getEmbedding(statement);

      if (!embedding || embedding.length === 0) {
        return { maxSimilarity: 0, embedding: [] };
      }

      const candidates = await db.questionEmbeddings
        .where('specialty')
        .equals(specialty)
        .and((r) => r.topic === topic)
        .toArray();

      let maxSimilarity = 0;
      for (const candidate of candidates) {
        const sim = cosineSimilarity(embedding, candidate.embedding);
        if (sim > maxSimilarity) maxSimilarity = sim;
      }

      return { maxSimilarity, embedding };
    } catch (err) {
      console.warn(
        `[QuestionSimilarityEngine] Embedding indisponível para questão "${statement.substring(0, 30)}..." — pulando checagem de similaridade para esta questão específica:`,
        err
      );
      return { maxSimilarity: 0, embedding: [] };
    }
  }

  async registerQuestionEmbedding(
    questionId: string,
    specialty: string,
    topic: string,
    embedding: number[]
  ): Promise<void> {
    if (!embedding || embedding.length === 0) return;
    try {
      await db.questionEmbeddings.put({
        id: `qemb-${questionId}`,
        questionId,
        specialty,
        topic,
        embedding,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn(`[QuestionSimilarityEngine] Falha ao registrar embedding no Dexie para questão ${questionId}:`, err);
    }
  }
}

export const questionSimilarityEngine = new QuestionSimilarityEngine();
export { SIMILARITY_THRESHOLD, MAX_REGENERATION_ATTEMPTS };
