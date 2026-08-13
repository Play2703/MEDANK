import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../db/database';
import { medicalEntityExtractionService } from './MedicalEntityExtractionService';

describe('MedicalEntityExtractionService - NER Híbrido (Local vs API Fallback)', () => {
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

  it('TAREFA H4 — deve resolver localmente sem NENHUMA chamada de rede para chunk com vocabulário médico reconhecido pelo dicionário', async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy;

    const assetId = 'asset-test-local-ner';
    const chunks = ['O paciente apresentou hipertensão arterial sistêmica e diabetes mellitus tipo 2 com dispneia.'];

    const count = await medicalEntityExtractionService.extractAndSaveEntities(assetId, chunks);

    expect(count).toBe(1);

    // Confirma que NENHUMA chamada HTTP /api/extract-entities foi realizada
    expect(fetchSpy).not.toHaveBeenCalled();

    const storedRecords = await db.chunkEntities.where('assetId').equals(assetId).toArray();
    expect(storedRecords.length).toBe(1);
    expect(storedRecords[0].entities.length).toBeGreaterThan(0);

    const entityTexts = storedRecords[0].entities.map((e) => e.text);
    expect(entityTexts).toContain('hipertensão arterial sistêmica');
    expect(entityTexts).toContain('diabetes mellitus tipo 2');
  });

  it('TAREFA H4 — deve acionar o fallback para /api/extract-entities (Gemini) quando a cobertura do chunk for baixa (< 3%)', async () => {
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
                  text: 'Investimentos',
                  type: 'finding',
                  code_system: null,
                  code: null,
                  confidence: 0.8,
                },
              ],
              relations: [],
            },
          ],
        }),
      } as Response;
    });
    global.fetch = fetchSpy;

    const assetId = 'asset-test-fallback-gemini';
    const chunks = ['Reunião sobre planejamento estratégico de mercado e finanças corporativas.'];

    const count = await medicalEntityExtractionService.extractAndSaveEntities(assetId, chunks);

    expect(count).toBe(1);

    // Confirma que a chamada para /api/extract-entities FOI realizada por ter baixa cobertura local
    expect(fetchSpy).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/extract-entities'),
      expect.objectContaining({ method: 'POST' })
    );

    const storedRecords = await db.chunkEntities.where('assetId').equals(assetId).toArray();
    expect(storedRecords.length).toBe(1);
    expect(storedRecords[0].entities.length).toBe(1);
    expect(storedRecords[0].entities[0].text).toBe('Investimentos');
  });

  it('deve lidar com falha HTTP 500 do fallback Gemini sem crashar', async () => {
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

  it('deve lidar com falha HTTP 429 de cota excedida do fallback Gemini sem tratar como sucesso', async () => {
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
