import { describe, it, expect } from 'vitest';
import {
  buildCanonicalKey,
  deduplicateEntitiesIntraChunk,
  deduplicateRelationsIntraChunk,
  aggregateCanonicalEntityIndexRecord,
  aggregateGraphEdgeRecord,
} from './entityAggregation';
import { ExtractedMedicalEntity, ExtractedMedicalRelation, CodeSystem } from '../../domain/entities/ChunkEntity';

describe('entityAggregation Unit Tests', () => {
  it('buildCanonicalKey deve usar code_system:code se existir, senão sinonímia/normalizedText', () => {
    expect(buildCanonicalKey('CID-10' as CodeSystem, 'E11', 'diabetes mellitus tipo 2')).toBe('CID-10:E11');
    expect(buildCanonicalKey(null, null, 'asma')).toBe('asma');
  });

  it('deduplicateEntitiesIntraChunk deve normalizar e deduplicar mantendo a maior confiança', () => {
    const rawEntities = [
      { text: ' Diabetes Mellitus ', type: 'disease', confidence: 0.8 },
      { text: 'diabetes mellitus', type: 'disease', confidence: 0.95, code_system: 'CID-10', code: 'E11' },
      { text: 'Insulina', type: 'medication', confidence: 0.85 },
    ];

    const deduplicated = deduplicateEntitiesIntraChunk(rawEntities);
    expect(deduplicated.length).toBe(2);

    const dm = deduplicated.find((e) => e.normalizedText === 'diabetes mellitus');
    expect(dm).toBeDefined();
    expect(dm?.confidence).toBe(0.95);
    expect(dm?.code).toBe('E11');
  });

  it('deduplicateRelationsIntraChunk deve validar se subject e object estão nas entidades do chunk', () => {
    const deduplicatedEntities: ExtractedMedicalEntity[] = [
      { text: 'Insulina', normalizedText: 'insulina', canonicalKey: 'insulina', type: 'medication', code_system: null, code: null, confidence: 0.9 },
      { text: 'Glicemia', normalizedText: 'glicemia', canonicalKey: 'glicemia', type: 'finding', code_system: null, code: null, confidence: 0.9 },
    ];

    const rawRelations = [
      { subjectText: 'Insulina', objectText: 'Glicemia', predicate: 'reduz', confidence: 0.9 },
      { subjectText: 'Insulina', objectText: 'Pressão', predicate: 'afeta', confidence: 0.8 }, // 'Pressão' não é entidade válida
    ];

    const deduplicated = deduplicateRelationsIntraChunk(rawRelations, deduplicatedEntities);
    expect(deduplicated.length).toBe(1);
    expect(deduplicated[0].predicate).toBe('reduz');
  });

  it('aggregateCanonicalEntityIndexRecord deve atualizar ocorrência e textos vistos de forma pura', () => {
    const ent: ExtractedMedicalEntity = {
      text: 'DM2',
      normalizedText: 'dm2',
      canonicalKey: 'CID-10:E11',
      type: 'disease',
      code_system: 'CID-10',
      code: 'E11',
      confidence: 0.9,
    };

    const initial = aggregateCanonicalEntityIndexRecord(undefined, ent, 'asset-1', '2026-01-01');
    expect(initial.occurrenceCount).toBe(1);
    expect(initial.assetIds).toEqual(['asset-1']);
    expect(initial.seenTexts).toEqual(['DM2']);

    const updated = aggregateCanonicalEntityIndexRecord(initial, { ...ent, text: 'Diabetes Tipo 2' }, 'asset-2', '2026-01-02');
    expect(updated.occurrenceCount).toBe(2);
    expect(updated.assetIds).toEqual(['asset-1', 'asset-2']);
    expect(updated.seenTexts).toEqual(['DM2', 'Diabetes Tipo 2']);
  });

  it('aggregateGraphEdgeRecord deve calcular maxConfidence e assetIds de forma pura', () => {
    const rel: ExtractedMedicalRelation = {
      subjectText: 'Insulina',
      subjectNormalized: 'insulina',
      subjectCanonicalKey: 'insulina',
      subjectType: 'medication',
      predicate: 'causa' as any,
      objectText: 'Glicemia',
      objectNormalized: 'glicemia',
      objectCanonicalKey: 'glicemia',
      objectType: 'finding',
      confidence: 0.85,
    };

    const edge1 = aggregateGraphEdgeRecord(undefined, rel, 'asset-1', '2026-01-01');
    expect(edge1.occurrenceCount).toBe(1);
    expect(edge1.maxConfidence).toBe(0.85);

    const edge2 = aggregateGraphEdgeRecord(edge1, { ...rel, confidence: 0.95 }, 'asset-1', '2026-01-02');
    expect(edge2.occurrenceCount).toBe(2);
    expect(edge2.maxConfidence).toBe(0.95);
  });
});
