/**
 * MedAnki RAGEngine (Fase 31, 32 & 32.5)
 *
 * Centralizes Retrieval-Augmented Generation (RAG):
 * 1. Semantic Chunk Retrieval via real Gemini Embeddings & Dexie IndexedDB
 * 2. Optional Banca and Professor filtering
 * 3. Anti-Duplication Concept Extraction from target deck
 * 4. Context & Prompt Assembly for Gemini AI Generation
 *
 * ZERO mock data or fake abstractions.
 */

import { db } from '../db/database';
import { realSemanticSearchService, SemanticChunkResult } from './RealSemanticSearchService';
import { medicalEntityExtractionService } from './MedicalEntityExtractionService';
import { apiUrl } from '../../lib/apiBaseUrl';

export interface RAGRetrievalOptions {
  topK?: number;
  subject?: string;
  deckId?: string;
  banca?: string;
  professor?: string;
}

export const MAX_CONTEXT_TOKENS_PER_CALL = 6000;

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function pruneChunksByTokenBudget(
  chunks: SemanticChunkResult[],
  maxTokens = MAX_CONTEXT_TOKENS_PER_CALL
): SemanticChunkResult[] {
  let accumulatedTokens = 0;
  const pruned: SemanticChunkResult[] = [];

  for (const chunk of chunks) {
    const chunkTokens = estimateTokenCount(chunk.content);
    if (accumulatedTokens + chunkTokens > maxTokens && pruned.length > 0) {
      break;
    }
    pruned.push(chunk);
    accumulatedTokens += chunkTokens;
  }

  return pruned;
}

export class RAGEngine {
  /**
   * Retrieves top-K semantically relevant chunks for a given query/subject,
   * optionally filtered by banca or professor, enriched with extracted medical entities,
   * pruned strictly by the MAX_CONTEXT_TOKENS_PER_CALL budget.
   */
  public async retrieveContext(query: string, options: RAGRetrievalOptions = {}): Promise<SemanticChunkResult[]> {
    const topK = options.topK || 5;
    const searchTerm = query || options.subject || 'Medicina';
    const searchRes = await realSemanticSearchService.searchTopChunks(searchTerm, topK, {
      banca: options.banca,
      professor: options.professor,
    });
    const chunks = searchRes.results;

    if (chunks.length === 0) return [];

    try {
      const entityMap = await medicalEntityExtractionService.getEntitiesForChunks(chunks);
      for (const chunk of chunks) {
        const key = `${chunk.assetId}-${chunk.chunkIndex}`;
        chunk.entities = entityMap.get(key) || [];
      }
    } catch (err) {
      console.warn('[RAGEngine] Failed to attach medical entities to context:', err);
    }

    return pruneChunksByTokenBudget(chunks, MAX_CONTEXT_TOKENS_PER_CALL);
  }

  /**
   * Retrieves existing card concepts from target deck to prevent duplicate card generation
   */
  public async getExistingDeckConcepts(deckId?: string, limit = 25): Promise<string> {
    if (!deckId) return '';

    try {
      const cards = await db.flashcards.where('deckId').equals(deckId).limit(limit).toArray();
      if (!cards || cards.length === 0) return '';

      const concepts = cards
        .map((c) => c.front.replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, '$1').trim())
        .filter((t) => t.length > 0)
        .slice(0, limit);

      if (concepts.length === 0) return '';
      return concepts.map((c) => `- ${c}`).join('\n');
    } catch (err) {
      console.warn('[RAGEngine] Failed to retrieve existing deck concepts:', err);
      return '';
    }
  }

  /**
   * Retrieves existing card concepts along with their text embeddings for semantic deduplication
   */
  public async getExistingDeckConceptsWithEmbeddings(
    deckId?: string,
    limit = 25
  ): Promise<{ text: string; embedding?: number[] }[]> {
    if (!deckId) return [];

    try {
      const cards = await db.flashcards.where('deckId').equals(deckId).limit(limit).toArray();
      if (!cards || cards.length === 0) return [];

      const concepts = cards
        .map((c) => c.front.replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, '$1').trim())
        .filter((t) => t.length > 0)
        .slice(0, limit);

      if (concepts.length === 0) return [];

      try {
        const res = await fetch(apiUrl('/api/embeddings'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: concepts }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.embeddings)) {
            return concepts.map((text, idx) => ({
              text,
              embedding: data.embeddings[idx],
            }));
          }
        }
      } catch (err) {
        console.warn('[RAGEngine] Failed fetching embeddings for existing concepts:', err);
      }

      return concepts.map((text) => ({ text }));
    } catch (err) {
      console.warn('[RAGEngine] Failed to retrieve existing deck concepts with embeddings:', err);
      return [];
    }
  }
}

export const ragEngine = new RAGEngine();
