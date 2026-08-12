import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../db/database';
import { medicalEntityExtractionService } from './MedicalEntityExtractionService';

describe('MedicalEntityExtractionService - NER API Error Handling', () => {
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

  it('deve lidar com falha HTTP 500 de /api/extract-entities sem crashar e preencher fallback de lote', async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ success: false, error: 'Falha interna na extração NER' }),
        json: async () => ({ success: false, error: 'Falha interna na extração NER' }),
      } as Response;
    });

    const assetId = 'asset-test-err-500';
    const chunks = ['Paciente com febre e tosse produtiva.'];

    const count = await medicalEntityExtractionService.extractAndSaveEntities(assetId, chunks);

    expect(count).toBe(1);
    const storedEntities = await db.chunkEntities.toArray();
    expect(storedEntities.length).toBe(1);
    expect(storedEntities[0].entities).toEqual([]);
    expect(storedEntities[0].assetId).toBe(assetId);
  });

  it('deve lidar com falha HTTP 429 de cota excedida de /api/extract-entities sem tratar como sucesso válido', async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 429,
        text: async () => JSON.stringify({ success: false, error: 'Cota do Gemini excedida (429/RESOURCE_EXHAUSTED)' }),
        json: async () => ({ success: false, error: 'Cota do Gemini excedida (429/RESOURCE_EXHAUSTED)' }),
      } as Response;
    });

    const assetId = 'asset-test-err-429';
    const chunks = ['Pneumonia comunitária grave tratada com ceftriaxona.'];

    const count = await medicalEntityExtractionService.extractAndSaveEntities(assetId, chunks);

    expect(count).toBe(1);
    const storedEntities = await db.chunkEntities.where('assetId').equals(assetId).toArray();
    expect(storedEntities.length).toBe(1);
    expect(storedEntities[0].entities).toEqual([]);
  });

  it('deve processar e salvar entidades clínicas corretamente quando a resposta for HTTP 200 com success: true', async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
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
                  text: 'Pneumonia',
                  type: 'disease',
                  code_system: 'CID-10',
                  code: 'J18.9',
                  confidence: 0.95,
                },
              ],
              relations: [],
            },
          ],
        }),
      } as Response;
    });

    const assetId = 'asset-test-ok-200';
    const chunks = ['Pneumonia comunitária grave.'];

    const count = await medicalEntityExtractionService.extractAndSaveEntities(assetId, chunks);

    expect(count).toBe(1);
    const storedEntities = await db.chunkEntities.where('assetId').equals(assetId).toArray();
    expect(storedEntities.length).toBe(1);
    expect(storedEntities[0].entities.length).toBe(1);
    expect(storedEntities[0].entities[0].text).toBe('Pneumonia');
    expect(storedEntities[0].entities[0].code).toBe('J18.9');

    const canonicalIndex = await db.canonicalEntityIndex.toArray();
    expect(canonicalIndex.length).toBe(1);
    expect(canonicalIndex[0].displayText).toBe('Pneumonia');
  });
});
