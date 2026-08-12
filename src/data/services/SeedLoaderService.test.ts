import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../db/database';
import { seedLoaderService } from './SeedLoaderService';

import { KnowledgeCategory } from '../../core/medcore_kernel/ontology/KnowledgeCategoryMapper';

describe('SeedLoaderService Unit Tests', () => {
  const originalFetch = global.fetch;
  const mockLocalStorage: Record<string, string> = {};

  beforeEach(async () => {
    Object.keys(mockLocalStorage).forEach((k) => delete mockLocalStorage[k]);
    if (typeof localStorage === 'undefined') {
      (global as any).localStorage = {
        getItem: (key: string) => mockLocalStorage[key] || null,
        setItem: (key: string, val: string) => { mockLocalStorage[key] = val; },
        removeItem: (key: string) => { delete mockLocalStorage[key]; },
        clear: () => { Object.keys(mockLocalStorage).forEach((k) => delete mockLocalStorage[k]); },
      };
    } else {
      localStorage.clear();
    }
    await db.knowledgeAssets.clear();
    await db.documentEmbeddings.clear();
    await db.chunkEntities.clear();
    await db.chunkRelations.clear();
    await db.canonicalEntityIndex.clear();
    await db.graphEdges.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('isSeedNeeded deve retornar true quando db.knowledgeAssets estiver vazio e flag não estiver definida', async () => {
    const needed = await seedLoaderService.isSeedNeeded();
    expect(needed).toBe(true);
  });

  it('isSeedNeeded deve retornar false quando o usuário já tiver dados em db.knowledgeAssets', async () => {
    await db.knowledgeAssets.put({
      id: 'asset-user-1',
      uuid: 'asset-user-1',
      title: 'Material do Usuário',
      category: KnowledgeCategory.apostila,
      subcategory: 'Geral',
      discipline: 'Medicina',
      specialty: 'Geral',
      author: 'Usuário',
      institution: 'Minha Faculdade',
      board: 'Geral',
      professor: 'Geral',
      year: 2026,
      semester: '1',
      tags: [],
      metadata: {},
      file: { name: 'meu_resumo.txt' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      processingStatus: 'completed',
    });

    const needed = await seedLoaderService.isSeedNeeded();
    expect(needed).toBe(false);
  });

  it('loadSeedBundle não deve carregar dados nem fazer fetch se o usuário já tiver dados reais', async () => {
    let fetchCalled = false;
    global.fetch = vi.fn().mockImplementation(async () => {
      fetchCalled = true;
      return { ok: true, json: async () => [] } as Response;
    });

    await db.knowledgeAssets.put({
      id: 'asset-user-real',
      uuid: 'asset-user-real',
      title: 'Material Existente',
      category: KnowledgeCategory.apostila,
      subcategory: 'Geral',
      discipline: 'Medicina',
      specialty: 'Geral',
      author: 'Usuário',
      institution: 'Minha Faculdade',
      board: 'Geral',
      professor: 'Geral',
      year: 2026,
      semester: '1',
      tags: [],
      metadata: {},
      file: { name: 'resumo.txt' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      processingStatus: 'completed',
    });

    const loaded = await seedLoaderService.loadSeedBundle();
    expect(loaded).toBe(false);
    expect(fetchCalled).toBe(false);
  });

  it('loadSeedBundle deve buscar os JSONs estáticos e popular as 6 tabelas no IndexedDB quando aprovado', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('knowledge-assets.json')) {
        return {
          ok: true,
          json: async () => [
            {
              id: 'seed-asset-1',
              uuid: 'seed-asset-1',
              title: 'Apostila Seed Endocrinologia',
              category: 'Apostila',
              subcategory: 'Endocrinologia',
              discipline: 'Endocrinologia',
              specialty: 'Endocrinologia',
              author: 'MedAnki',
              institution: 'MedAnki',
              board: 'REVALIDA',
              professor: 'Geral',
              year: 2026,
              semester: '1',
              tags: ['Endocrinologia'],
              metadata: { isSeed: true },
              file: { name: 'endo.pdf' },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              processingStatus: 'completed',
            },
          ],
        } as Response;
      }
      if (urlStr.includes('document-embeddings.json')) {
        return {
          ok: true,
          json: async () => [
            {
              id: 'seed-asset-1-0',
              assetId: 'seed-asset-1',
              chunkIndex: 0,
              content: 'Texto sobre Cetoacidose Diabética...',
              embedding: [0.1, 0.2, 0.3],
              createdAt: new Date().toISOString(),
            },
          ],
        } as Response;
      }
      if (urlStr.includes('chunk-entities.json')) {
        return { ok: true, json: async () => [] } as Response;
      }
      if (urlStr.includes('chunk-relations.json')) {
        return { ok: true, json: async () => [] } as Response;
      }
      if (urlStr.includes('canonical-entity-index.json')) {
        return { ok: true, json: async () => [] } as Response;
      }
      if (urlStr.includes('graph-edges.json')) {
        return { ok: true, json: async () => [] } as Response;
      }
      return { ok: true, json: async () => [] } as Response;
    });

    const loaded = await seedLoaderService.loadSeedBundle();
    expect(loaded).toBe(true);

    const assetCount = await db.knowledgeAssets.count();
    const embeddingCount = await db.documentEmbeddings.count();
    expect(assetCount).toBe(1);
    expect(embeddingCount).toBe(1);

    const isNeededAfter = await seedLoaderService.isSeedNeeded();
    expect(isNeededAfter).toBe(false);
  });
});
