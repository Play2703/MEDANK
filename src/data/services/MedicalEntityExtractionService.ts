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
  MedicalEntityType,
  RelationType,
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
import { Capacitor } from '@capacitor/core';
import { NERWorkerClient } from '../../../lib/core/engines/NERWorkerClient';

export { buildCanonicalKey };

const CATEGORY_TO_TYPE: Record<string, MedicalEntityType> = {
  DOENCA: 'disease',
  MEDICAMENTO: 'medication',
  SINTOMA: 'symptom',
  ESTRUTURA_ANATOMICA: 'anatomy',
  EXAME: 'exam',
  PROCEDIMENTO: 'procedure',
};

const RELATION_TYPE_TO_PREDICATE: Record<string, RelationType> = {
  CAUSA: 'causa',
  TRATAMENTO: 'trata',
  FATOR_DE_RISCO: 'causa',
  CONTRAINDICACAO: 'contraindica',
  MANIFESTACAO: 'é_sintoma_de',
  ASSOCIACAO: 'associado_a',
  DIAGNOSTICO_POR: 'diagnostica',
};

const localNerWorker = new NERWorkerClient();

export class MedicalEntityExtractionService {
  /**
   * Processa chunks de um documento delegando a extração NER para o endpoint /api/extract-entities.
   * O servidor executa a extração em alta velocidade utilizando o dicionário médico SQLite indexado
   * (sem custo de API e sem risco de OOM), acionando IA apenas se explicitamente habilitado.
   * Em ambiente nativo/offline ou caso o fetch falhe, usa o NERWorkerClient localmente como fallback transparente.
   * Em seguida, normaliza, atualiza o índice canônico e as arestas do grafo, persistindo no Dexie IndexedDB.
   */
  async extractAndSaveEntities(assetId: string, chunks: string[]): Promise<number> {
    if (!assetId || !chunks || chunks.length === 0) return 0;

    const BATCH_SIZE = 15;
    const now = new Date().toISOString();

    const entityRecordsMap = new Map<number, ChunkEntityRecord>();
    const relationRecordsMap = new Map<number, ChunkRelationRecord>();

    // Divide os chunks do documento em lotes
    const chunkIndices = chunks.map((_, idx) => idx);
    const batchObjects: Array<{ startIndex: number; batchIndices: number[] }> = [];
    for (let i = 0; i < chunkIndices.length; i += BATCH_SIZE) {
      const batchIndices = chunkIndices.slice(i, i + BATCH_SIZE);
      batchObjects.push({ startIndex: i, batchIndices });
    }

    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

    // Executa as chamadas em lotes concorrentes para o backend /api/extract-entities (ou local se offline)
    await mapWithConcurrency(batchObjects, 3, async (batchObj) => {
      const { batchIndices } = batchObj;

      if (!isOffline) {
        const batchPayload = batchIndices.map((cIdx) => ({
          assetId,
          chunkIndex: cIdx,
          text: chunks[cIdx],
        }));

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
                const chunkIdx = typeof item.chunkIndex === 'number' ? item.chunkIndex : 0;
                const rawEntities: any[] = Array.isArray(item.entities) ? item.entities : [];
                const rawRelations: any[] = Array.isArray(item.relations) ? item.relations : [];

                const deduplicatedEntities = deduplicateEntitiesIntraChunk(rawEntities);
                const deduplicatedRelations = deduplicateRelationsIntraChunk(rawRelations, deduplicatedEntities);

                entityRecordsMap.set(chunkIdx, {
                  id: `${assetId}-${chunkIdx}`,
                  assetId,
                  chunkIndex: chunkIdx,
                  entities: deduplicatedEntities,
                  createdAt: now,
                });

                relationRecordsMap.set(chunkIdx, {
                  id: `${assetId}-${chunkIdx}`,
                  assetId,
                  chunkIndex: chunkIdx,
                  relations: deduplicatedRelations,
                  createdAt: now,
                });
              }
            }
          }
        } catch (err) {
          console.warn(`[MedicalEntityExtractionService] NER API request failed for batch starting at ${batchObj.startIndex}, switching to local NERWorkerClient:`, err);
        }
      }

      // Fallback local robusto via Web Worker para chunks pendentes/offline
      for (const cIdx of batchIndices) {
        if (!entityRecordsMap.has(cIdx)) {
          const text = chunks[cIdx];
          try {
            const analysis = await localNerWorker.analyzeText(text);
            const rawEntities = (analysis.entities || []).map((ent) => ({
              text: ent.text,
              type: CATEGORY_TO_TYPE[ent.category] || (ent.category.toLowerCase() as MedicalEntityType),
              code_system: (ent.codeSystem as CodeSystem) ?? null,
              code: ent.code ?? null,
              confidence: 1.0,
            }));

            const rawRelations = (analysis.relations || []).map((rel) => {
              const sourceEnt = analysis.entities.find((e) => e.normalizedTerm === rel.sourceEntity);
              const targetEnt = analysis.entities.find((e) => e.normalizedTerm === rel.targetEntity);
              const sourceCat = sourceEnt?.category || '';
              const targetCat = targetEnt?.category || '';

              return {
                sourceEntity: rel.sourceEntity,
                targetEntity: rel.targetEntity,
                sourceType: CATEGORY_TO_TYPE[sourceCat] || (sourceCat.toLowerCase() as MedicalEntityType),
                targetType: CATEGORY_TO_TYPE[targetCat] || (targetCat.toLowerCase() as MedicalEntityType),
                predicate: RELATION_TYPE_TO_PREDICATE[rel.relationType] || (rel.relationType.toLowerCase() as RelationType),
                confidence: 1.0,
              };
            });

            const deduplicatedEntities = deduplicateEntitiesIntraChunk(rawEntities);
            const deduplicatedRelations = deduplicateRelationsIntraChunk(rawRelations, deduplicatedEntities);

            entityRecordsMap.set(cIdx, {
              id: `${assetId}-${cIdx}`,
              assetId,
              chunkIndex: cIdx,
              entities: deduplicatedEntities,
              createdAt: now,
            });

            relationRecordsMap.set(cIdx, {
              id: `${assetId}-${cIdx}`,
              assetId,
              chunkIndex: cIdx,
              relations: deduplicatedRelations,
              createdAt: now,
            });
          } catch (workerErr) {
            console.warn(`[MedicalEntityExtractionService] Local Worker NER extraction failed for chunk ${cIdx}:`, workerErr);
            entityRecordsMap.set(cIdx, {
              id: `${assetId}-${cIdx}`,
              assetId,
              chunkIndex: cIdx,
              entities: [],
              createdAt: now,
            });
            relationRecordsMap.set(cIdx, {
              id: `${assetId}-${cIdx}`,
              assetId,
              chunkIndex: cIdx,
              relations: [],
              createdAt: now,
            });
          }
        }
      }
    });

    // Step 3: Agrega entidades canônicas e arestas no grafo de conhecimento
    const entityRecordsToPut = Array.from(entityRecordsMap.values());
    const relationRecordsToPut = Array.from(relationRecordsMap.values());

    for (const entRec of entityRecordsToPut) {
      for (const ent of entRec.entities) {
        try {
          const existingIndex = await db.canonicalEntityIndex.get(ent.canonicalKey);
          const updatedIndex = aggregateCanonicalEntityIndexRecord(existingIndex, ent, assetId, now);
          await db.canonicalEntityIndex.put(updatedIndex);
        } catch (cErr) {
          console.warn(`[MedicalEntityExtractionService] Failed to upsert canonical key ${ent.canonicalKey}:`, cErr);
        }
      }
    }

    for (const relRec of relationRecordsToPut) {
      if (relRec.relations && relRec.relations.length > 0) {
        await knowledgeGraphService.upsertGraphEdges(relRec.relations, assetId);
      }
    }

    // Step 4: Persiste registros no Dexie IndexedDB
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
