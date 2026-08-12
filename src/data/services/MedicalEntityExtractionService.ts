/**
 * Medical Entity Extraction Service (NER), Canonicalization & Clinical Relations
 * Interacts with /api/extract-entities to extract CID-10, SNOMED CT, 20 clinical entity types, and clinical relations.
 * Computes canonicalKey (`${code_system}:${code}` or normalizedText fallback), updates global canonicalEntityIndex,
 * triggers KnowledgeGraphService graphEdges upsert, and persists into Dexie IndexedDB.
 */

import { db } from '../db/database';
import {
  ChunkEntityRecord,
  ChunkRelationRecord,
  CanonicalEntityIndexRecord,
  CodeSystem,
  ExtractedMedicalEntity,
  ExtractedMedicalRelation,
} from '../../domain/entities/ChunkEntity';
import { normalizeEntityText } from '../../core/utils/entityNormalizer';
import {
  buildCanonicalKey,
  deduplicateEntitiesIntraChunk,
  deduplicateRelationsIntraChunk,
  aggregateCanonicalEntityIndexRecord,
} from '../../core/utils/entityAggregation';
import { knowledgeGraphService } from './KnowledgeGraphService';
import { mapWithConcurrency } from '../../core/utils/asyncUtils';
import { apiUrl } from '../../lib/apiBaseUrl';

export { buildCanonicalKey };

export class MedicalEntityExtractionService {
  /**
   * Process document chunks in batches of 15, call /api/extract-entities, normalize, canonicalize,
   * update canonical index, trigger Knowledge Graph edges upsert, and store in Dexie
   */
  async extractAndSaveEntities(assetId: string, chunks: string[]): Promise<number> {
    if (!assetId || !chunks || chunks.length === 0) return 0;

    const BATCH_SIZE = 15;
    const now = new Date().toISOString();

    const batchObjects: Array<{ startIndex: number; batchTexts: string[] }> = [];
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      batchObjects.push({
        startIndex: i,
        batchTexts: chunks.slice(i, i + BATCH_SIZE),
      });
    }

    const batchResults = await mapWithConcurrency(batchObjects, 3, async (batchObj) => {
      const { startIndex, batchTexts } = batchObj;
      const batchPayload = batchTexts.map((text, batchIdx) => ({
        assetId,
        chunkIndex: startIndex + batchIdx,
        text,
      }));

      const entityRecords: ChunkEntityRecord[] = [];
      const relationRecords: ChunkRelationRecord[] = [];

      try {
        const res = await fetch(apiUrl('/api/extract-entities'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chunks: batchPayload }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.results)) {
            for (const item of data.results) {
              const chunkIdx = typeof item.chunkIndex === 'number' ? item.chunkIndex : startIndex;
              const rawEntities: any[] = Array.isArray(item.entities) ? item.entities : [];
              const rawRelations: any[] = Array.isArray(item.relations) ? item.relations : [];

              // 1. Pure intra-chunk entity normalization & deduplication
              const deduplicatedEntities = deduplicateEntitiesIntraChunk(rawEntities);

              // 2. Upsert deduplicated entities into global canonicalEntityIndex
              for (const ent of deduplicatedEntities) {
                try {
                  const existingIndex = await db.canonicalEntityIndex.get(ent.canonicalKey);
                  const updatedIndex = aggregateCanonicalEntityIndexRecord(existingIndex, ent, assetId, now);
                  await db.canonicalEntityIndex.put(updatedIndex);
                } catch (cErr) {
                  console.warn(`[MedicalEntityExtractionService] Failed to upsert canonical key ${ent.canonicalKey}:`, cErr);
                }
              }

              // 3. Pure intra-chunk relation validation & deduplication
              const deduplicatedRelations = deduplicateRelationsIntraChunk(rawRelations, deduplicatedEntities);

              // 4. Trigger Knowledge Graph Service edge aggregation
              if (deduplicatedRelations.length > 0) {
                await knowledgeGraphService.upsertGraphEdges(deduplicatedRelations, assetId);
              }

              entityRecords.push({
                id: `${assetId}-${chunkIdx}`,
                assetId,
                chunkIndex: chunkIdx,
                entities: deduplicatedEntities,
                createdAt: now,
              });

              relationRecords.push({
                id: `${assetId}-${chunkIdx}`,
                assetId,
                chunkIndex: chunkIdx,
                relations: deduplicatedRelations,
                createdAt: now,
              });
            }

            return { entityRecords, relationRecords };
          }
        }
      } catch (err) {
        console.warn(`[MedicalEntityExtractionService] API call failed for batch starting at ${startIndex}:`, err);
      }

      // Fallback empty entity and relation records for batch if API unavailable/error
      for (let batchIdx = 0; batchIdx < batchTexts.length; batchIdx++) {
        const chunkIdx = startIndex + batchIdx;
        entityRecords.push({
          id: `${assetId}-${chunkIdx}`,
          assetId,
          chunkIndex: chunkIdx,
          entities: [],
          createdAt: now,
        });

        relationRecords.push({
          id: `${assetId}-${chunkIdx}`,
          assetId,
          chunkIndex: chunkIdx,
          relations: [],
          createdAt: now,
        });
      }

      return { entityRecords, relationRecords };
    });

    const entityRecordsToPut: ChunkEntityRecord[] = [];
    const relationRecordsToPut: ChunkRelationRecord[] = [];

    for (const bRes of batchResults) {
      entityRecordsToPut.push(...bRes.entityRecords);
      relationRecordsToPut.push(...bRes.relationRecords);
    }

    if (entityRecordsToPut.length > 0) {
      await db.chunkEntities.bulkPut(entityRecordsToPut);
    }
    if (relationRecordsToPut.length > 0) {
      await db.chunkRelations.bulkPut(relationRecordsToPut);
    }

    return entityRecordsToPut.length;
  }

  /**
   * Retrieves extracted medical entities for a list of (assetId, chunkIndex) pairs from Dexie
   */
  async getEntitiesForChunks(
    chunkRefs: Array<{ assetId: string; chunkIndex: number }>
  ): Promise<Map<string, ExtractedMedicalEntity[]>> {
    const resultMap = new Map<string, ExtractedMedicalEntity[]>();
    if (!chunkRefs || chunkRefs.length === 0) return resultMap;

    const ids = chunkRefs.map((ref) => `${ref.assetId}-${ref.chunkIndex}`);
    try {
      const records = await db.chunkEntities.bulkGet(ids);
      for (const rec of records) {
        if (rec) {
          resultMap.set(`${rec.assetId}-${rec.chunkIndex}`, rec.entities || []);
        }
      }
    } catch (err) {
      console.warn('[MedicalEntityExtractionService] Failed to retrieve chunk entities from Dexie:', err);
    }

    return resultMap;
  }

  /**
   * Retrieves extracted clinical relations for a list of (assetId, chunkIndex) pairs from Dexie
   */
  async getRelationsForChunks(
    chunkRefs: Array<{ assetId: string; chunkIndex: number }>
  ): Promise<Map<string, ExtractedMedicalRelation[]>> {
    const resultMap = new Map<string, ExtractedMedicalRelation[]>();
    if (!chunkRefs || chunkRefs.length === 0) return resultMap;

    const ids = chunkRefs.map((ref) => `${ref.assetId}-${ref.chunkIndex}`);
    try {
      const records = await db.chunkRelations.bulkGet(ids);
      for (const rec of records) {
        if (rec) {
          resultMap.set(`${rec.assetId}-${rec.chunkIndex}`, rec.relations || []);
        }
      }
    } catch (err) {
      console.warn('[MedicalEntityExtractionService] Failed to retrieve chunk relations from Dexie:', err);
    }

    return resultMap;
  }

  /**
   * Retrieves a canonical entity record from canonicalEntityIndex by its canonicalKey
   */
  async getCanonicalEntity(canonicalKey: string): Promise<CanonicalEntityIndexRecord | undefined> {
    if (!canonicalKey) return undefined;
    try {
      return await db.canonicalEntityIndex.get(canonicalKey);
    } catch (err) {
      console.warn(`[MedicalEntityExtractionService] Failed to get canonical entity ${canonicalKey}:`, err);
      return undefined;
    }
  }

  /**
   * Performs partial case-insensitive search on displayText and seenTexts in canonicalEntityIndex
   */
  async searchCanonicalEntities(query: string, limit = 20): Promise<CanonicalEntityIndexRecord[]> {
    if (!query || !query.trim()) return [];
    const normalizedQuery = normalizeEntityText(query);

    try {
      const allRecords = await db.canonicalEntityIndex.toArray();
      const filtered = allRecords.filter((rec) => {
        const displayNorm = normalizeEntityText(rec.displayText);
        if (displayNorm.includes(normalizedQuery)) return true;
        return rec.seenTexts.some((t) => normalizeEntityText(t).includes(normalizedQuery));
      });

      return filtered.slice(0, limit);
    } catch (err) {
      console.warn(`[MedicalEntityExtractionService] Search canonical entities failed for query "${query}":`, err);
      return [];
    }
  }
}

export const medicalEntityExtractionService = new MedicalEntityExtractionService();
