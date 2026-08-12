/**
 * Pure Entity & Graph Aggregation Utility Functions
 * NO Dexie/IndexedDB side-effects. Pure state transformation functions.
 * Usable both in client browser app and offline Node seed generation script.
 */

import {
  CodeSystem,
  ExtractedMedicalEntity,
  ExtractedMedicalRelation,
  CanonicalEntityIndexRecord,
  GraphEdgeRecord,
} from '../../domain/entities/ChunkEntity';
import { normalizeEntityText } from './entityNormalizer';
import { resolveSynonym } from './medicalSynonyms';

export function buildCanonicalKey(
  code_system: CodeSystem | null,
  code: string | null,
  normalizedText: string
): string {
  if (code_system && code && code.trim()) {
    return `${code_system}:${code.trim()}`;
  }
  return resolveSynonym(normalizedText);
}

/**
 * Normalizes, canonicalizes, and deduplicates raw entity predictions within a single chunk
 */
export function deduplicateEntitiesIntraChunk(rawEntities: any[]): ExtractedMedicalEntity[] {
  if (!Array.isArray(rawEntities)) return [];

  const entityMap = new Map<string, ExtractedMedicalEntity>();
  for (const rawEnt of rawEntities) {
    if (!rawEnt || !rawEnt.text) continue;
    const text = String(rawEnt.text).trim();
    const normalizedText = normalizeEntityText(text);
    if (!normalizedText) continue;

    const type = rawEnt.type || 'finding';
    const confidence = typeof rawEnt.confidence === 'number' ? rawEnt.confidence : 0.8;
    const code_system = rawEnt.code_system || null;
    const code = rawEnt.code || null;
    const canonicalKey = buildCanonicalKey(code_system, code, normalizedText);

    const key = `${normalizedText}::${type}`;
    const existing = entityMap.get(key);
    if (existing) {
      if (confidence > existing.confidence) {
        existing.confidence = confidence;
      }
      if (!existing.code && code) {
        existing.code = code;
        existing.code_system = code_system;
        existing.canonicalKey = buildCanonicalKey(code_system, code, normalizedText);
      }
    } else {
      entityMap.set(key, {
        text,
        normalizedText,
        canonicalKey,
        type,
        code_system,
        code,
        confidence,
      });
    }
  }

  return Array.from(entityMap.values());
}

/**
 * Normalizes, validates against chunk entities, and deduplicates raw clinical relations within a single chunk
 */
export function deduplicateRelationsIntraChunk(
  rawRelations: any[],
  deduplicatedEntities: ExtractedMedicalEntity[]
): ExtractedMedicalRelation[] {
  if (!Array.isArray(rawRelations) || deduplicatedEntities.length === 0) return [];

  const normalizedToEntityMap = new Map<string, ExtractedMedicalEntity>();
  for (const ent of deduplicatedEntities) {
    normalizedToEntityMap.set(ent.normalizedText, ent);
  }

  const relationMap = new Map<string, ExtractedMedicalRelation>();
  for (const rawRel of rawRelations) {
    if (!rawRel || !rawRel.subjectText || !rawRel.objectText || !rawRel.predicate) continue;

    const subjectText = String(rawRel.subjectText).trim();
    const objectText = String(rawRel.objectText).trim();
    const subjectNormalized = normalizeEntityText(subjectText);
    const objectNormalized = normalizeEntityText(objectText);

    if (!subjectNormalized || !objectNormalized) continue;

    const subjectEntity = normalizedToEntityMap.get(subjectNormalized);
    const objectEntity = normalizedToEntityMap.get(objectNormalized);

    if (!subjectEntity || !objectEntity) continue;

    const predicate = rawRel.predicate;
    const relKey = `${subjectNormalized}::${predicate}::${objectNormalized}`;
    const confidence = typeof rawRel.confidence === 'number' ? rawRel.confidence : 0.8;

    const existingRel = relationMap.get(relKey);
    if (existingRel) {
      if (confidence > existingRel.confidence) {
        existingRel.confidence = confidence;
      }
    } else {
      relationMap.set(relKey, {
        subjectText,
        subjectNormalized,
        subjectCanonicalKey: subjectEntity.canonicalKey,
        subjectType: subjectEntity.type,
        predicate,
        objectText,
        objectNormalized,
        objectCanonicalKey: objectEntity.canonicalKey,
        objectType: objectEntity.type,
        confidence,
      });
    }
  }

  return Array.from(relationMap.values());
}

/**
 * Pure state updater for canonical entity index record
 */
export function aggregateCanonicalEntityIndexRecord(
  existingIndex: CanonicalEntityIndexRecord | undefined,
  ent: ExtractedMedicalEntity,
  assetId: string,
  now: string
): CanonicalEntityIndexRecord {
  if (existingIndex) {
    const updatedAssetIds = assetId && !existingIndex.assetIds.includes(assetId)
      ? [...existingIndex.assetIds, assetId]
      : existingIndex.assetIds;
    const updatedSeenTexts = existingIndex.seenTexts.includes(ent.text)
      ? existingIndex.seenTexts
      : [...existingIndex.seenTexts, ent.text];

    return {
      ...existingIndex,
      occurrenceCount: existingIndex.occurrenceCount + 1,
      assetIds: updatedAssetIds,
      seenTexts: updatedSeenTexts,
      displayText: ent.confidence > 0.85 ? ent.text : existingIndex.displayText,
      code_system: ent.code_system || existingIndex.code_system,
      code: ent.code || existingIndex.code,
      updatedAt: now,
    };
  }

  return {
    canonicalKey: ent.canonicalKey,
    displayText: ent.text,
    type: ent.type,
    code_system: ent.code_system,
    code: ent.code,
    seenTexts: [ent.text],
    assetIds: assetId ? [assetId] : [],
    occurrenceCount: 1,
    updatedAt: now,
  };
}

/**
 * Pure state updater for graph edge record
 */
export function aggregateGraphEdgeRecord(
  existingEdge: GraphEdgeRecord | undefined,
  rel: ExtractedMedicalRelation,
  assetId: string,
  now: string
): GraphEdgeRecord {
  const edgeId = `${rel.subjectCanonicalKey}::${rel.predicate}::${rel.objectCanonicalKey}`;
  const relConf = rel.confidence || 0.8;

  if (existingEdge) {
    const updatedAssetIds = assetId && !existingEdge.assetIds.includes(assetId)
      ? [...existingEdge.assetIds, assetId]
      : existingEdge.assetIds;

    return {
      ...existingEdge,
      occurrenceCount: existingEdge.occurrenceCount + 1,
      maxConfidence: Math.max(existingEdge.maxConfidence, relConf),
      assetIds: updatedAssetIds,
      updatedAt: now,
    };
  }

  return {
    id: edgeId,
    subjectCanonicalKey: rel.subjectCanonicalKey,
    predicate: rel.predicate,
    objectCanonicalKey: rel.objectCanonicalKey,
    occurrenceCount: 1,
    maxConfidence: relConf,
    assetIds: assetId ? [assetId] : [],
    updatedAt: now,
  };
}
