/**
 * Lexical Keyword BM25/Matching and Hybrid Score Calculation
 * Shared between Main Thread and Similarity Search Web Worker.
 */

export const HYBRID_WEIGHT_COSINE = 0.7;
export const HYBRID_WEIGHT_LEXICAL = 0.3;

/**
 * Computes lexical keyword match score (0.0 to 1.0) between query text and chunk content
 */
export function computeLexicalScore(query: string, chunkContent: string): number {
  if (!query || !chunkContent) return 0;
  const queryTerms = query
    .toLowerCase()
    .replace(/[^\w\s\u00C0-\u024F]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  if (queryTerms.length === 0) return 0;

  const chunkLower = chunkContent.toLowerCase();
  let matches = 0;
  for (const term of queryTerms) {
    if (chunkLower.includes(term)) {
      matches++;
    }
  }
  return matches / queryTerms.length;
}

/**
 * Combines Cosine Similarity (70%) and Lexical BM25/Keyword Score (30%)
 */
export function computeHybridScore(cosineSim: number, lexicalScore: number): number {
  return HYBRID_WEIGHT_COSINE * cosineSim + HYBRID_WEIGHT_LEXICAL * lexicalScore;
}
