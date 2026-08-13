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
import {
  dictionaryNEREngine,
  estimateCoverage,
  MIN_COVERAGE_THRESHOLD,
} from '../../core/ner/DictionaryNEREngine';
import { knowledgeGraphService } from './KnowledgeGraphService';
import { mapWithConcurrency } from '../../core/utils/asyncUtils';
import { apiUrl } from '../../lib/apiBaseUrl';

export { buildCanonicalKey };

function mapCategoryToEntityType(category: string): MedicalEntityType {
  switch (category) {
    case 'DOENCA':
      return 'disease';
    case 'MEDICAMENTO':
      return 'medication';
    case 'SINTOMA':
      return 'symptom';
    case 'ESTRUTURA_ANATOMICA':
      return 'anatomy';
    case 'EXAME':
      return 'exam';
    case 'PROCEDIMENTO':
      return 'procedure';
    default:
      return 'finding';
  }
}

function mapRelationTypeToPredicate(type: string): RelationType {
  switch (type) {
    case 'TRATAMENTO':
      return 'trata';
    case 'CAUSA':
    case 'EFEITO_ADVERSO':
      return 'causa';
    case 'CONTRAINDICACAO':
      return 'contraindica';
    case 'MANIFESTACAO':
      return 'é_sintoma_de';
    case 'DIAGNOSTICO_POR':
      return 'diagnostica';
    case 'PREVENCAO':
      return 'previne';
    case 'FATOR_DE_RISCO':
    case 'ASSOCIACAO':
    case 'MECANISMO_DE_ACAO':
    default:
      return 'associado_a';
  }
}

export class MedicalEntityExtractionService {
  /**
   * Processa chunks de um documento no esquema HÍBRIDO:
   * 1. Executa extração determinística via dicionário Aho-Corasick local (grátis e instantâneo).
   * 2. Calcula a cobertura do chunk via `estimateCoverage`. Se cobertura >= MIN_COVERAGE_THRESHOLD, usa o resultado local.
   * 3. Se cobertura < MIN_COVERAGE_THRESHOLD, encaminha o chunk em lote para o fallback da Gemini API (/api/extract-entities).
   * 4. Normaliza, atualiza o índice canônico e as arestas do grafo, persistindo no Dexie IndexedDB.
   */
  async extractAndSaveEntities(assetId: string, chunks: string[]): Promise<number> {
    if (!assetId || !chunks || chunks.length === 0) return 0;

    const BATCH_SIZE = 15;
    const now = new Date().toISOString();

    const entityRecordsMap = new Map<number, ChunkEntityRecord>();
    const relationRecordsMap = new Map<number, ChunkRelationRecord>();

    const fallbackChunkIndices: number[] = [];

    // Step 1: Extração local primeiro para cada chunk do documento
    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const text = chunks[chunkIdx];
      const matchedEntities = dictionaryNEREngine.extractEntities(text);
      const coverage = estimateCoverage(text, matchedEntities);

      if (coverage >= MIN_COVERAGE_THRESHOLD) {
        // Cobertura suficiente pelo dicionário local -> resolve localmente (sem chamada de rede)
        const extractedRelations = dictionaryNEREngine.extractRelations(text, matchedEntities);

        const rawEntities: ExtractedMedicalEntity[] = matchedEntities.map((m) => {
          const normText = normalizeEntityText(m.normalizedTerm);
          return {
            text: m.text,
            normalizedText: normText,
            canonicalKey: buildCanonicalKey(null, null, normText),
            type: mapCategoryToEntityType(m.category),
            code_system: null,
            code: null,
            confidence: 1.0,
          };
        });

        const rawRelations: ExtractedMedicalRelation[] = extractedRelations.map((rel) => {
          const sourceMatch = matchedEntities.find((e) => e.normalizedTerm === rel.sourceEntity);
          const targetMatch = matchedEntities.find((e) => e.normalizedTerm === rel.targetEntity);

          const subjText = sourceMatch ? sourceMatch.text : rel.sourceEntity;
          const subjNorm = normalizeEntityText(rel.sourceEntity);
          const subjType = sourceMatch ? mapCategoryToEntityType(sourceMatch.category) : 'finding';

          const objText = targetMatch ? targetMatch.text : rel.targetEntity;
          const objNorm = normalizeEntityText(rel.targetEntity);
          const objType = targetMatch ? mapCategoryToEntityType(targetMatch.category) : 'finding';

          return {
            subjectText: subjText,
            subjectNormalized: subjNorm,
            subjectCanonicalKey: buildCanonicalKey(null, null, subjNorm),
            subjectType: subjType,
            predicate: mapRelationTypeToPredicate(rel.relationType),
            objectText: objText,
            objectNormalized: objNorm,
            objectCanonicalKey: buildCanonicalKey(null, null, objNorm),
            objectType: objType,
            confidence: 1.0,
          };
        });

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
      } else {
        // Cobertura baixa -> agenda fallback para a API do Gemini
        fallbackChunkIndices.push(chunkIdx);
      }
    }

    const localResolvedCount = chunks.length - fallbackChunkIndices.length;
    const fallbackCount = fallbackChunkIndices.length;
    const savingsPercent = chunks.length > 0 ? ((localResolvedCount / chunks.length) * 100).toFixed(1) : '0';

    console.debug(
      `[Telemetry] NER Hybrid Extraction para asset ${assetId}: ${localResolvedCount}/${chunks.length} chunks resolvidos localmente (${savingsPercent}%), ${fallbackCount} chunks via Gemini API fallback. Economia de ${localResolvedCount} chamadas à API (${savingsPercent}% de economia).`
    );

    // Step 2: Executa fallback Gemini em lotes apenas para os chunks que precisarem de API externa
    if (fallbackChunkIndices.length > 0) {
      const batchObjects: Array<{ startIndex: number; batchIndices: number[] }> = [];
      for (let i = 0; i < fallbackChunkIndices.length; i += BATCH_SIZE) {
        const batchIndices = fallbackChunkIndices.slice(i, i + BATCH_SIZE);
        batchObjects.push({ startIndex: i, batchIndices });
      }

      await mapWithConcurrency(batchObjects, 3, async (batchObj) => {
        const { batchIndices } = batchObj;
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
          console.warn(`[MedicalEntityExtractionService] Gemini API fallback failed for batch starting at ${batchObj.startIndex}:`, err);
        }

        for (const cIdx of batchIndices) {
          if (!entityRecordsMap.has(cIdx)) {
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
      });
    }

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
