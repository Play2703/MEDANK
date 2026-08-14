import { cosineSimilarity } from './cosineSimilarity';
import { computeLexicalScore, computeHybridScore } from './lexicalScore';

export interface SimilarityCandidateMeta {
  id: string;
  content: string;
}

export interface SimilarityWorkerRequest {
  id: number;
  queryText: string;
  queryVectorBuffer: ArrayBuffer;
  dimension: number;
  candidates: SimilarityCandidateMeta[];
  /**
   * Contiguous single ArrayBuffer containing all candidate vectors packed end-to-end.
   * Format: candidate i vector resides at indices [i * dimension, (i + 1) * dimension)
   * in Float32Array(vectorsBuffer).
   */
  vectorsBuffer: ArrayBuffer;
  topK: number;
}

export interface SimilarityWorkerResultItem {
  id: string;
  cosineScore: number;
  lexicalScore: number;
  hybridScore: number;
}

export interface SimilarityWorkerResponse {
  id: number;
  results: SimilarityWorkerResultItem[];
}

self.onmessage = (event: MessageEvent<SimilarityWorkerRequest>) => {
  const { id, queryText, queryVectorBuffer, dimension, candidates, vectorsBuffer, topK } = event.data;

  if (
    !candidates ||
    candidates.length === 0 ||
    !queryVectorBuffer ||
    !vectorsBuffer ||
    !dimension ||
    dimension <= 0
  ) {
    self.postMessage({ id, results: [] } as SimilarityWorkerResponse);
    return;
  }

  const queryVector = new Float32Array(queryVectorBuffer);
  const allVectors = new Float32Array(vectorsBuffer);
  const numCandidates = candidates.length;

  const scored: SimilarityWorkerResultItem[] = new Array(numCandidates);

  for (let i = 0; i < numCandidates; i++) {
    const candidate = candidates[i];
    // Zero-copy view into contiguous shared Float32Array
    const candVector = allVectors.subarray(i * dimension, (i + 1) * dimension);

    const cosSim = cosineSimilarity(queryVector, candVector);
    const lexScore = computeLexicalScore(queryText, candidate.content);
    const hybridScore = computeHybridScore(cosSim, lexScore);

    scored[i] = {
      id: candidate.id,
      cosineScore: cosSim,
      lexicalScore: lexScore,
      hybridScore,
    };
  }

  scored.sort((a, b) => b.hybridScore - a.hybridScore);
  self.postMessage({ id, results: scored.slice(0, topK) } as SimilarityWorkerResponse);
};
