/**
 * Cosine Similarity Calculation in Pure JS
 * Computes dot(A, B) / (||A|| * ||B||) between two float vectors.
 * Supports standard arrays number[] and contiguous Float32Array buffers.
 */

export function cosineSimilarity(
  vecA: number[] | Float32Array,
  vecB: number[] | Float32Array
): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
    return 0;
  }

  const len = vecA.length;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i++) {
    const a = vecA[i];
    const b = vecB[i];
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
