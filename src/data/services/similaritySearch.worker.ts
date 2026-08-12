import { cosineSimilarity } from './cosineSimilarity';

export interface SimilarityWorkerRequest {
  id: number;
  queryVector: number[];
  candidates: { id: string; vector: number[] }[];
  topK: number;
}

export interface SimilarityWorkerResponse {
  id: number;
  results: { id: string; score: number }[];
}

self.onmessage = (event: MessageEvent<SimilarityWorkerRequest>) => {
  const { id, queryVector, candidates, topK } = event.data;
  if (!candidates || candidates.length === 0 || !queryVector || queryVector.length === 0) {
    self.postMessage({ id, results: [] } as SimilarityWorkerResponse);
    return;
  }

  const scored = candidates.map((c) => ({
    id: c.id,
    score: cosineSimilarity(queryVector, c.vector),
  }));

  scored.sort((a, b) => b.score - a.score);
  self.postMessage({ id, results: scored.slice(0, topK) } as SimilarityWorkerResponse);
};
