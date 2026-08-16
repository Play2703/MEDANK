import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MedicalEntityExtractionService } from './MedicalEntityExtractionService';
import { db } from '../db/database';

describe('MedicalEntityExtractionService - Offline & Fallback Handling', () => {
  beforeEach(async () => {
    await db.chunkEntities.clear();
    await db.chunkRelations.clear();
    await db.canonicalEntityIndex.clear();
    vi.restoreAllMocks();
  });

  it('1. Deve acionar o fallback local sem quebrar quando a API /api/extract-entities falhar ou estiver offline', async () => {
    // Simula falha de rede na chamada ao endpoint /api/extract-entities
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline or failed connection'));

    const service = new MedicalEntityExtractionService();
    const chunks = [
      'Paciente com diagnóstico de Insuficiência Cardíaca iniciou tratamento com Enalapril 10mg.',
    ];

    const savedCount = await service.extractAndSaveEntities('test-asset-1', chunks);

    // O serviço não deve lançar erro e deve persistir registros de chunk
    const storedEntities = await db.chunkEntities.toArray();
    expect(storedEntities.length).toBe(1);
    expect(storedEntities[0].assetId).toBe('test-asset-1');
  });
});
