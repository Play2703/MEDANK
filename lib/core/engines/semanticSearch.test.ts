import { describe, it, expect, beforeEach } from 'vitest';
import {
  cosineSimilarity,
  WorkerNEREngine,
  DocumentEmbeddingItem,
  nerWorkerClient,
} from './index';

describe('Vector Mathematics - cosineSimilarity', () => {
  it('deve retornar 1.0 para vetores idênticos', () => {
    const v1 = [0.2, 0.5, 0.8, -0.1];
    const v2 = [0.2, 0.5, 0.8, -0.1];
    const sim = cosineSimilarity(v1, v2);
    expect(sim).toBeCloseTo(1.0, 5);
  });

  it('deve retornar 1.0 para vetores colineares (mesma direção e sentido)', () => {
    const v1 = [1, 2, 3];
    const v2 = [2, 4, 6];
    const sim = cosineSimilarity(v1, v2);
    expect(sim).toBeCloseTo(1.0, 5);
  });

  it('deve retornar -1.0 para vetores em sentidos opostos', () => {
    const v1 = [1, 0, 0];
    const v2 = [-1, 0, 0];
    const sim = cosineSimilarity(v1, v2);
    expect(sim).toBeCloseTo(-1.0, 5);
  });

  it('deve retornar 0.0 para vetores perfeitamente ortogonais', () => {
    const v1 = [1, 0, 0];
    const v2 = [0, 1, 0];
    const sim = cosineSimilarity(v1, v2);
    expect(sim).toBeCloseTo(0.0, 5);
  });

  it('deve lidar com Float32Array de alta dimensionalidade (768 dimensões)', () => {
    const v1 = new Float32Array(768).fill(0.1);
    const v2 = new Float32Array(768).fill(0.1);
    const sim = cosineSimilarity(v1, v2);
    expect(sim).toBeCloseTo(1.0, 5);
  });

  it('deve retornar 0 para vetores vazios, nulos ou de magnitude zero (evita divisão por zero)', () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
    expect(cosineSimilarity(null as any, [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], undefined as any)).toBe(0);
  });
});

describe('WorkerNEREngine - Semantic Search & Offline Vector Indexing', () => {
  let engine: WorkerNEREngine;

  const mockDocuments: DocumentEmbeddingItem[] = [
    {
      id: 'doc-cardio-1',
      assetId: 'asset-cardio',
      chunkIndex: 0,
      content: 'Insuficiência Cardíaca Congestiva descompensada com fração de ejeção reduzida.',
      vector: [0.9, 0.1, 0.0, 0.0],
      examBoard: 'ENARE',
      professor: 'Dr. Cardiologia',
    },
    {
      id: 'doc-cardio-2',
      assetId: 'asset-cardio',
      chunkIndex: 1,
      content: 'Tratamento farmacológico com IECA, betabloqueadores e espironolactona.',
      vector: [0.8, 0.2, 0.0, 0.0],
      examBoard: 'USP',
      professor: 'Dr. Cardiologia',
    },
    {
      id: 'doc-pneumo-1',
      assetId: 'asset-pneumo',
      chunkIndex: 0,
      content: 'Pneumonia adquirida na comunidade com consolidação lobar e febre alta.',
      vector: [0.0, 0.0, 0.9, 0.1],
      examBoard: 'Revalida',
      professor: 'Dra. Pneumo',
    },
    {
      id: 'doc-nefro-1',
      assetId: 'asset-nefro',
      chunkIndex: 0,
      content: 'Doença Renal Crônica estágio 5 em terapia renal substitutiva.',
      vector: [0.0, 0.0, 0.1, 0.9],
      examBoard: 'ENARE',
      professor: 'Dr. Nefro',
    },
  ];

  beforeEach(() => {
    engine = new WorkerNEREngine();
  });

  it('deve carregar embeddings e reportar o total de itens indexados', () => {
    const count = engine.loadEmbeddings(mockDocuments);
    expect(count).toBe(4);
    expect(engine.getEmbeddingsCount()).toBe(4);
  });

  it('deve filtrar itens inválidos sem vetor ao carregar embeddings', () => {
    const invalidList = [
      { id: '1', assetId: 'a', chunkIndex: 0, content: 'test', vector: [] },
      { id: '2', assetId: 'a', chunkIndex: 1, content: 'test', vector: [0.1, 0.2] },
      null as any,
    ];
    const count = engine.loadEmbeddings(invalidList);
    expect(count).toBe(1);
    expect(engine.getEmbeddingsCount()).toBe(1);
  });

  it('deve ranquear e retornar os documentos mais similares a partir do vetor de busca (Cosine Similarity)', () => {
    engine.loadEmbeddings(mockDocuments);

    // Vetor de busca próximo a cardiologia ([1.0, 0.0, 0.0, 0.0])
    const queryVector = [1.0, 0.0, 0.0, 0.0];
    const results = engine.searchSemantically(queryVector, 2);

    expect(results.length).toBe(2);
    // Primeiro resultado deve ser doc-cardio-1 com score muito alto
    expect(results[0].id).toBe('doc-cardio-1');
    expect(results[0].similarity).toBeGreaterThan(0.9);
    expect(results[0].examBoard).toBe('ENARE');

    // Segundo resultado deve ser doc-cardio-2
    expect(results[1].id).toBe('doc-cardio-2');
    expect(results[1].similarity).toBeGreaterThan(0.8);
    expect(results[0].similarity).toBeGreaterThanOrEqual(results[1].similarity);
  });

  it('deve respeitar o filtro minScore na busca semântica', () => {
    engine.loadEmbeddings(mockDocuments);

    const queryVector = [1.0, 0.0, 0.0, 0.0];
    // doc-cardio-1 tem cosine ~0.9938, doc-cardio-2 tem cosine ~0.9701
    // Exigir similaridade mínima de 0.98 retorna apenas doc-cardio-1
    const results = engine.searchSemantically(queryVector, 5, 0.98);

    expect(results.length).toBe(1);
    expect(results[0].id).toBe('doc-cardio-1');
  });


  it('deve retornar array vazio se não houver embeddings carregados ou query vazia', () => {
    expect(engine.searchSemantically([1, 2, 3])).toEqual([]);

    engine.loadEmbeddings(mockDocuments);
    expect(engine.searchSemantically([])).toEqual([]);
    expect(engine.searchSemantically(null as any)).toEqual([]);
  });
});

describe('NERWorkerClient - Semantic Vector Search Messaging', () => {
  it('deve carregar embeddings e realizar busca semântica através do NERWorkerClient', async () => {
    const docs: DocumentEmbeddingItem[] = [
      {
        id: 'mock-1',
        assetId: 'asset-1',
        chunkIndex: 0,
        content: 'Fibrilação atrial e anticoagulação oral',
        vector: [0.7, 0.7, 0.0],
      },
      {
        id: 'mock-2',
        assetId: 'asset-2',
        chunkIndex: 0,
        content: 'Asma brônquica e corticoide inalatório',
        vector: [0.0, 0.0, 1.0],
      },
    ];

    const loadedCount = await nerWorkerClient.loadEmbeddings(docs);
    expect(loadedCount).toBeGreaterThanOrEqual(2);

    const results = await nerWorkerClient.searchSemantically([0.7, 0.7, 0.0], 1);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('mock-1');
    expect(results[0].similarity).toBeCloseTo(1.0, 4);
  });
});
