/**
 * Entity for Real Document Embeddings stored in Dexie local IndexedDB
 */

export interface DocumentEmbedding {
  id: string; // uuid
  assetId: string; // foreign key to KnowledgeAsset
  chunkIndex: number;
  content: string; // text chunk (~500-800 tokens)
  vector: number[]; // 768 float array
  dimension: number; // 768 (explicitly stored from gemini-embedding-001 outputDimensionality: 768)
  model: string; // 'gemini-embedding-001' ou 'Xenova/multilingual-e5-small'
  embeddingSchemaVersion?: string; // Versão do esquema de embedding (ex: 'local-e5-small-v1')
  examBoard?: string; // Banca da prova (ex: ENARE, Revalida, USP)
  professor?: string; // Nome do professor/preceptor
  createdAt: string;
}
