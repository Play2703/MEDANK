/**
 * Configuration for Browser-Local Multilingual Embeddings Engine (transformers.js)
 * Model: Xenova/multilingual-e5-small (ONNX quantized q8, ~90MB download)
 * Dimension: 384
 * Schema Version: local-e5-small-v1
 *
 * Selection Rationale:
 * Xenova/multilingual-e5-small is a high-accuracy 384-dimensional embedding model
 * optimized for technical, medical and multi-language semantic retrieval in Portuguese (PT-BR).
 * Quantized ONNX format ensures lightweight download (~90MB) and fast browser execution.
 */

export const LOCAL_EMBEDDING_CONFIG = {
  modelName: 'Xenova/multilingual-e5-small',
  outputDimension: 384,
  embeddingSchemaVersion: 'local-e5-small-v1',
  quantized: true,
} as const;
