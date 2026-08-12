import type { SimilarityWorkerRequest, SimilarityWorkerResponse } from './similaritySearch.worker';
import { cosineSimilarity } from './cosineSimilarity';

let workerPool: Worker[] = [];
let requestIdCounter = 0;
const pendingRequests = new Map<number, (results: { id: string; score: number }[]) => void>();

const POOL_SIZE =
  typeof navigator !== 'undefined' && navigator.hardwareConcurrency
    ? Math.min(Math.max(navigator.hardwareConcurrency - 1, 2), 6)
    : 4;

export function getWorkerPool(): Worker[] {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return [];
  }

  if (workerPool.length === 0) {
    for (let i = 0; i < POOL_SIZE; i++) {
      try {
        const worker = new Worker(
          new URL('./similaritySearch.worker.ts', import.meta.url),
          { type: 'module' }
        );

        worker.onmessage = (event: MessageEvent<SimilarityWorkerResponse>) => {
          const { id, results } = event.data;
          const resolver = pendingRequests.get(id);
          if (resolver) {
            pendingRequests.delete(id);
            resolver(results);
          }
        };

        worker.onerror = (err) => {
          console.warn('[WorkerPool] Web Worker error:', err);
        };

        workerPool.push(worker);
      } catch (err) {
        console.warn('[WorkerPool] Failed to instantiate worker in pool:', err);
      }
    }
  }

  return workerPool;
}

export function getSimilarityWorker(): Worker | null {
  const pool = getWorkerPool();
  return pool.length > 0 ? pool[0] : null;
}

function dispatchToWorker(
  worker: Worker,
  queryVector: number[],
  candidates: { id: string; vector: number[] }[],
  topK: number
): Promise<{ id: string; score: number }[]> {
  return new Promise((resolve) => {
    const reqId = ++requestIdCounter;
    pendingRequests.set(reqId, resolve);
    const requestMsg: SimilarityWorkerRequest = {
      id: reqId,
      queryVector,
      candidates,
      topK,
    };
    worker.postMessage(requestMsg);
  });
}

export async function computeSimilaritiesInWorker(
  queryVector: number[],
  candidates: { id: string; vector: number[] }[],
  topK: number
): Promise<{ id: string; score: number }[]> {
  if (!candidates || candidates.length === 0) {
    return [];
  }

  const pool = getWorkerPool();

  // Fallback to main thread if workers are unavailable (e.g. Node / SSR / test environment)
  if (pool.length === 0) {
    const scored = candidates.map((c) => ({
      id: c.id,
      score: cosineSimilarity(queryVector, c.vector),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  const LARGE_CANDIDATES_THRESHOLD = 500;

  // Use single worker for small candidate lists to avoid partitioning overhead
  if (candidates.length <= LARGE_CANDIDATES_THRESHOLD || pool.length === 1) {
    return dispatchToWorker(pool[0], queryVector, candidates, topK);
  }

  // Partition large candidate list across pool workers
  const chunkSize = Math.ceil(candidates.length / pool.length);
  const promises: Promise<{ id: string; score: number }[] >[] = [];

  for (let i = 0; i < pool.length; i++) {
    const chunk = candidates.slice(i * chunkSize, (i + 1) * chunkSize);
    if (chunk.length > 0) {
      promises.push(dispatchToWorker(pool[i], queryVector, chunk, topK));
    }
  }

  const partialResults = await Promise.all(promises);
  const merged = partialResults.flat();
  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, topK);
}
