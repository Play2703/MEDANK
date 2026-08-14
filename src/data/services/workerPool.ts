import type {
  SimilarityCandidateMeta,
  SimilarityWorkerRequest,
  SimilarityWorkerResponse,
  SimilarityWorkerResultItem,
} from './similaritySearch.worker';
import { cosineSimilarity } from './cosineSimilarity';
import { computeLexicalScore, computeHybridScore } from './lexicalScore';

export type { SimilarityWorkerResultItem };

export interface SimilarityCandidateInput {
  id: string;
  content: string;
  vector: number[] | Float32Array;
}

let workerPool: Worker[] = [];
let requestIdCounter = 0;
const pendingRequests = new Map<number, (results: SimilarityWorkerResultItem[]) => void>();

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

/**
 * Packs candidates into a single contiguous ArrayBuffer for zero-copy ownership transfer via postMessage.
 * Layout: Candidate i's 384-float vector occupies indices [i * dimension, (i + 1) * dimension).
 */
function packCandidates(
  candidates: SimilarityCandidateInput[],
  dimension: number
): { meta: SimilarityCandidateMeta[]; buffer: ArrayBuffer } {
  const numCandidates = candidates.length;
  const flatArray = new Float32Array(numCandidates * dimension);
  const meta: SimilarityCandidateMeta[] = new Array(numCandidates);

  for (let i = 0; i < numCandidates; i++) {
    const c = candidates[i];
    meta[i] = { id: c.id, content: c.content || '' };
    const vec = c.vector;
    if (vec instanceof Float32Array) {
      flatArray.set(vec.subarray(0, dimension), i * dimension);
    } else if (Array.isArray(vec)) {
      const copyLen = Math.min(vec.length, dimension);
      for (let d = 0; d < copyLen; d++) {
        flatArray[i * dimension + d] = vec[d];
      }
    }
  }

  return { meta, buffer: flatArray.buffer };
}

function dispatchToWorker(
  worker: Worker,
  queryText: string,
  queryVector: number[] | Float32Array,
  candidates: SimilarityCandidateInput[],
  topK: number,
  dimension: number
): Promise<SimilarityWorkerResultItem[]> {
  return new Promise((resolve) => {
    const reqId = ++requestIdCounter;
    pendingRequests.set(reqId, resolve);

    // Create fresh independent ArrayBuffers for transfer so caller's original in-memory data is never detached
    const queryFloat32 =
      queryVector instanceof Float32Array
        ? new Float32Array(queryVector)
        : new Float32Array(queryVector);

    const { meta, buffer: vectorsBuffer } = packCandidates(candidates, dimension);

    const requestMsg: SimilarityWorkerRequest = {
      id: reqId,
      queryText,
      queryVectorBuffer: queryFloat32.buffer,
      dimension,
      candidates: meta,
      vectorsBuffer,
      topK,
    };

    // Zero-copy ownership transfer of ArrayBuffers to Worker
    worker.postMessage(requestMsg, [queryFloat32.buffer, vectorsBuffer]);
  });
}

/**
 * High-Performance Hybrid Vector & Lexical Similarity search offloaded to Web Worker Pool.
 * Performs both Cosine Similarity (0.7) and BM25 Lexical Score (0.3) inside the background thread.
 * If running in Node.js / SSR / Vitest test environments without Workers, falls back to in-process execution.
 */
export async function computeSimilaritiesInWorker(
  queryText: string,
  queryVector: number[] | Float32Array,
  candidates: SimilarityCandidateInput[],
  topK: number,
  dimension?: number
): Promise<SimilarityWorkerResultItem[]> {
  if (!candidates || candidates.length === 0 || !queryVector || queryVector.length === 0) {
    return [];
  }

  const resolvedDimension =
    dimension ||
    (queryVector.length > 0 ? queryVector.length : 384);

  const pool = getWorkerPool();

  // In-process fallback for Node.js / SSR / Vitest
  if (pool.length === 0) {
    const qVec = queryVector instanceof Float32Array ? queryVector : new Float32Array(queryVector);
    const scored: SimilarityWorkerResultItem[] = candidates.map((c) => {
      const cVec = c.vector instanceof Float32Array ? c.vector : new Float32Array(c.vector);
      const cosSim = cosineSimilarity(qVec, cVec);
      const lexScore = computeLexicalScore(queryText, c.content);
      const hybridScore = computeHybridScore(cosSim, lexScore);
      return {
        id: c.id,
        cosineScore: cosSim,
        lexicalScore: lexScore,
        hybridScore,
      };
    });
    scored.sort((a, b) => b.hybridScore - a.hybridScore);
    return scored.slice(0, topK);
  }

  const LARGE_CANDIDATES_THRESHOLD = 500;

  // Single worker for small candidate lists
  if (candidates.length <= LARGE_CANDIDATES_THRESHOLD || pool.length === 1) {
    return dispatchToWorker(pool[0], queryText, queryVector, candidates, topK, resolvedDimension);
  }

  // Partition large candidate lists across pool workers
  const chunkSize = Math.ceil(candidates.length / pool.length);
  const promises: Promise<SimilarityWorkerResultItem[]>[] = [];

  for (let i = 0; i < pool.length; i++) {
    const chunk = candidates.slice(i * chunkSize, (i + 1) * chunkSize);
    if (chunk.length > 0) {
      promises.push(
        dispatchToWorker(pool[i], queryText, queryVector, chunk, topK, resolvedDimension)
      );
    }
  }

  const partialResults = await Promise.all(promises);
  const merged = partialResults.flat();
  merged.sort((a, b) => b.hybridScore - a.hybridScore);
  return merged.slice(0, topK);
}
