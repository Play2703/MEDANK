import { db } from '../../db/database';
import { localEmbeddingClient } from '../embeddings/LocalEmbeddingClient';

export interface EntityEmbeddingEntry {
  canonicalKey: string;
  displayText: string;
}

export class EntityEmbeddingIndexer {
  /**
   * Ensures an embedding exists in Dexie db.entityEmbeddings for a single canonical entity.
   * If already persisted, returns it immediately without recomputation.
   * Otherwise, generates via localEmbeddingClient and persists with timestamp.
   */
  public async ensureEmbeddingForEntity(
    canonicalKey: string,
    displayText: string
  ): Promise<number[] | null> {
    if (!canonicalKey || !displayText) return null;

    try {
      const existing = await db.entityEmbeddings.get(canonicalKey);
      if (existing && Array.isArray(existing.embedding) && existing.embedding.length > 0) {
        return existing.embedding;
      }

      const [vector] = await localEmbeddingClient.generateEmbeddings([displayText]);
      if (vector && vector.length > 0) {
        await db.entityEmbeddings.put({
          canonicalKey,
          embedding: vector,
          updatedAt: new Date().toISOString(),
        });
        return vector;
      }
    } catch (err) {
      console.warn(`[EntityEmbeddingIndexer] Error ensuring embedding for "${canonicalKey}":`, err);
    }

    return null;
  }

  /**
   * Ensures embeddings exist in Dexie db.entityEmbeddings for a batch of canonical entities.
   * Filters only entities that lack embeddings, generates in a single batched call via
   * localEmbeddingClient (transformers.js local pipeline), and bulk-persists them.
   */
  public async ensureEmbeddingsForEntities(entities: EntityEmbeddingEntry[]): Promise<void> {
    if (!entities || entities.length === 0) return;

    try {
      const validEntities = entities.filter(
        (e) => typeof e.canonicalKey === 'string' && e.canonicalKey.trim().length > 0 && e.displayText
      );
      if (validEntities.length === 0) return;

      const keys = validEntities.map((e) => e.canonicalKey);
      const existingRecords = await db.entityEmbeddings.where('canonicalKey').anyOf(keys).toArray();
      const existingKeySet = new Set(existingRecords.map((r) => r.canonicalKey));

      const missing = validEntities.filter((e) => !existingKeySet.has(e.canonicalKey));
      if (missing.length === 0) return;

      const missingTexts = missing.map((e) => e.displayText);
      const generatedVectors = await localEmbeddingClient.generateEmbeddings(missingTexts);

      const recordsToPut: Array<{ canonicalKey: string; embedding: number[]; updatedAt: string }> = [];
      const now = new Date().toISOString();

      for (let i = 0; i < missing.length; i++) {
        const vec = generatedVectors[i];
        if (vec && vec.length > 0) {
          recordsToPut.push({
            canonicalKey: missing[i].canonicalKey,
            embedding: vec,
            updatedAt: now,
          });
        }
      }

      if (recordsToPut.length > 0) {
        await db.entityEmbeddings.bulkPut(recordsToPut);
      }
    } catch (err) {
      console.warn('[EntityEmbeddingIndexer] Batch ensureEmbeddings error:', err);
    }
  }
}

export const entityEmbeddingIndexer = new EntityEmbeddingIndexer();
