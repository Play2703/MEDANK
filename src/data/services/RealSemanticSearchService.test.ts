import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../db/database';
import { realSemanticSearchService } from './RealSemanticSearchService';
import { LOCAL_EMBEDDING_CONFIG } from './embeddings/localEmbeddingConfig';
import { DocumentEmbedding } from '../../domain/entities/DocumentEmbedding';

describe('RealSemanticSearchService - In-Memory Caching & Hybrid Search Offloading', () => {
  beforeEach(async () => {
    await db.documentEmbeddings.clear();
    await db.knowledgeAssets.clear();
    realSemanticSearchService.invalidateEmbeddingsCache();
    vi.restoreAllMocks();
  });

  it('deve realizar busca semântica híbrida e retornar resultados com scores calculados', async () => {
    const now = new Date().toISOString();
    const docRecords: DocumentEmbedding[] = [
      {
        id: 'emb-1',
        assetId: 'asset-cardio',
        chunkIndex: 0,
        content: 'Insuficiência cardíaca congestiva com dispneia paroxística noturna.',
        vector: new Float32Array(LOCAL_EMBEDDING_CONFIG.outputDimension).fill(0.1),
        dimension: LOCAL_EMBEDDING_CONFIG.outputDimension,
        model: LOCAL_EMBEDDING_CONFIG.modelName,
        embeddingSchemaVersion: LOCAL_EMBEDDING_CONFIG.embeddingSchemaVersion,
        examBoard: 'ENARE',
        professor: 'Dr. Cardiologia',
        createdAt: now,
      },
      {
        id: 'emb-2',
        assetId: 'asset-cardio',
        chunkIndex: 1,
        content: 'Tratamento da IC com IECA e betabloqueadores em dose otimizada.',
        vector: new Float32Array(LOCAL_EMBEDDING_CONFIG.outputDimension).fill(0.1),
        dimension: LOCAL_EMBEDDING_CONFIG.outputDimension,
        model: LOCAL_EMBEDDING_CONFIG.modelName,
        embeddingSchemaVersion: LOCAL_EMBEDDING_CONFIG.embeddingSchemaVersion,
        examBoard: 'USP',
        professor: 'Dr. Cardiologia',
        createdAt: now,
      },
    ];

    await db.documentEmbeddings.bulkAdd(docRecords);

    const searchRes = await realSemanticSearchService.searchTopChunks('insuficiência cardíaca dispneia', 2);

    expect(searchRes.results.length).toBe(2);
    expect(searchRes.results[0].hybridScore).toBeDefined();
    expect(searchRes.results[0].similarity).toBeDefined();
    expect(searchRes.results[0].lexicalScore).toBeDefined();
    expect(searchRes.hasOutdatedEmbeddings).toBe(false);
  });

  it('deve usar o cache em memória de embeddings entre buscas subsequentes sem reler o IndexedDB', async () => {
    const now = new Date().toISOString();
    const docRecords: DocumentEmbedding[] = [
      {
        id: 'emb-cache-1',
        assetId: 'asset-1',
        chunkIndex: 0,
        content: 'Hipertensão arterial sistêmica primária.',
        vector: new Float32Array(LOCAL_EMBEDDING_CONFIG.outputDimension).fill(0.05),
        dimension: LOCAL_EMBEDDING_CONFIG.outputDimension,
        model: LOCAL_EMBEDDING_CONFIG.modelName,
        embeddingSchemaVersion: LOCAL_EMBEDDING_CONFIG.embeddingSchemaVersion,
        createdAt: now,
      },
    ];

    await db.documentEmbeddings.bulkAdd(docRecords);

    const toArraySpy = vi.spyOn(db.documentEmbeddings, 'toArray');

    // 1ª Busca: deve ler do IndexedDB e preencher o cache em memória
    await realSemanticSearchService.searchTopChunks('hipertensão', 1);
    expect(toArraySpy).toHaveBeenCalledTimes(1);

    // 2ª Busca (com query ou filtro diferente): deve reusar o cache em memória SEM chamar toArray novamente
    await realSemanticSearchService.searchTopChunks('arterial sistêmica', 1);
    expect(toArraySpy).toHaveBeenCalledTimes(1);

    // Invalidação explícita do cache
    realSemanticSearchService.invalidateEmbeddingsCache();

    // 3ª Busca após invalidação: deve chamar toArray novamente para recarregar
    await realSemanticSearchService.searchTopChunks('hipertensão', 1);
    expect(toArraySpy).toHaveBeenCalledTimes(2);
  });

  it('deve invalidar automaticamente o cache de embeddings ao indexar novo documento', async () => {
    const toArraySpy = vi.spyOn(db.documentEmbeddings, 'toArray');

    // Inicializa o cache
    await realSemanticSearchService.searchTopChunks('qualquer busca', 1);
    expect(toArraySpy).toHaveBeenCalledTimes(1);

    // Indexa um novo documento (que chama invalidateEmbeddingsCache internamente)
    await realSemanticSearchService.indexDocument(
      'asset-novo',
      'Diabetes mellitus tipo 2 diagnosticado com hemoglobina glicada alterada.'
    );

    // Próxima busca deve recarregar os dados atualizados do IndexedDB
    await realSemanticSearchService.searchTopChunks('diabetes', 1);
    expect(toArraySpy).toHaveBeenCalledTimes(2);
  });
});
