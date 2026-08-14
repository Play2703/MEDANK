import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../db/database';
import { medicalEntityExtractionService } from './MedicalEntityExtractionService';

describe('MedicalEntityExtractionService - NER API Client', () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    await db.canonicalEntityIndex.clear();
    await db.chunkEntities.clear();
    await db.chunkRelations.clear();
    await db.graphEdges.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('deve delegar a extração NER para /api/extract-entities e persistir entidades e relações no Dexie', async () => {
    const fetchSpy = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          results: [
            {
              chunkIndex: 0,
              entities: [
                {
                  text: 'hipertensão arterial sistêmica',
                  normalizedText: 'hipertensao arterial sistemica',
                  canonicalKey: 'CID-10:I10',
                  type: 'disease',
                  code_system: 'CID-10',
                  code: 'I10',
                  confidence: 1.0,
                },
                {
                  text: 'diabetes mellitus tipo 2',
                  normalizedText: 'diabetes mellitus tipo 2',
                  canonicalKey: 'CID-10:E11',
                  type: 'disease',
                  code_system: 'CID-10',
                  code: 'E11',
                  confidence: 1.0,
                },
              ],
              relations: [
                {
                  subjectText: 'hipertensão arterial sistêmica',
                  subjectNormalized: 'hipertensao arterial sistemica',
                  subjectCanonicalKey: 'CID-10:I10',
                  subjectType: 'disease',
                  predicate: 'associado_a',
                  objectText: 'diabetes mellitus tipo 2',
                  objectNormalized: 'diabetes mellitus tipo 2',
                  objectCanonicalKey: 'CID-10:E11',
                  objectType: 'disease',
                  confidence: 0.9,
                },
              ],
            },
          ],
        }),
      } as Response;
    });
    global.fetch = fetchSpy;

    const assetId = 'asset-test-api-ner';
    const chunks = ['O paciente apresentou hipertensão arterial sistêmica e diabetes mellitus tipo 2 com dispneia.'];

    const count = await medicalEntityExtractionService.extractAndSaveEntities(assetId, chunks);

    expect(count).toBe(1);

    // Confirma que a chamada para /api/extract-entities foi realizada com o payload correto
    expect(fetchSpy).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/extract-entities'),
      expect.objectContaining({ method: 'POST' })
    );

    const storedRecords = await db.chunkEntities.where('assetId').equals(assetId).toArray();
    expect(storedRecords.length).toBe(1);
    expect(storedRecords[0].entities.length).toBe(2);

    const entityTexts = storedRecords[0].entities.map((e) => e.text);
    expect(entityTexts).toContain('hipertensão arterial sistêmica');
    expect(entityTexts).toContain('diabetes mellitus tipo 2');

    // Confirma persistência de canonical entities e arestas de grafo
    const canonical = await db.canonicalEntityIndex.get('CID-10:I10');
    expect(canonical).toBeDefined();

    const storedRelations = await db.chunkRelations.where('assetId').equals(assetId).toArray();
    expect(storedRelations.length).toBe(1);
    expect(storedRelations[0].relations.length).toBe(1);
  });

  it('deve lidar com falha HTTP 500 da API sem crashar', async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ success: false, error: 'Falha interna na extração NER' }),
        json: async () => ({ success: false, error: 'Falha interna na extração NER' }),
      } as Response;
    });

    const assetId = 'asset-test-err-500';
    const chunks = ['Texto genérico sem vocabulário médico sobre relatórios e planilhas de contabilidade.'];

    const count = await medicalEntityExtractionService.extractAndSaveEntities(assetId, chunks);

    expect(count).toBe(1);
    const storedEntities = await db.chunkEntities.toArray();
    expect(storedEntities.length).toBe(1);
    expect(storedEntities[0].entities).toEqual([]);
    expect(storedEntities[0].assetId).toBe(assetId);
  });

  it('deve lidar com falha HTTP 429 de cota excedida sem tratar como sucesso', async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ success: false, error: 'Cota do Gemini excedida (429/RESOURCE_EXHAUSTED)' }),
        json: async () => ({ success: false, error: 'Cota do Gemini excedida (429/RESOURCE_EXHAUSTED)' }),
      } as Response;
    });

    const assetId = 'asset-test-err-429';
    const chunks = ['Texto genérico sem termos médicos sobre gestão comercial e vendas imobiliárias.'];

    const count = await medicalEntityExtractionService.extractAndSaveEntities(assetId, chunks);

    expect(count).toBe(1);
    const storedEntities = await db.chunkEntities.where('assetId').equals(assetId).toArray();
    expect(storedEntities.length).toBe(1);
    expect(storedEntities[0].entities).toEqual([]);
  });
});
