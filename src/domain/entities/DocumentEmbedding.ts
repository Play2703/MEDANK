/**
 * Entity for Real Document Embeddings stored in Dexie local IndexedDB
 *
 * Vector representation:
 * Uses Float32Array for maximum runtime memory efficiency and zero-copy transfers,
 * while allowing number[] for transparent backwards compatibility with seed JSON / legacy IndexedDB data.
 */

export interface DocumentEmbedding {
  id: string; // uuid
  assetId: string; // foreign key to KnowledgeAsset
  chunkIndex: number;
  content: string; // text chunk (~500-800 tokens)
  vector: Float32Array | number[]; // 384 float array / buffer
  dimension: number; // 384 (explicitly stored from local E5 embedding config)
  model: string; // 'Xenova/multilingual-e5-small'
  embeddingSchemaVersion?: string; // Versão do esquema de embedding (ex: 'local-e5-small-v1')
  examBoard?: string; // Banca da prova (ex: ENARE, Revalida, USP)
  professor?: string; // Nome do professor/preceptor
  createdAt: string;
}
