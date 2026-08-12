import { pipeline, env } from '@xenova/transformers';
import { LOCAL_EMBEDDING_CONFIG } from './localEmbeddingConfig';

// Allow loading models from Hugging Face Hub
env.allowLocalModels = false;
env.useBrowserCache = true;

let extractorPipeline: any = null;

export interface LocalEmbeddingWorkerRequest {
  id: number;
  texts: string[];
}

export interface LocalEmbeddingWorkerResponse {
  id: number;
  embeddings?: number[][];
  error?: string;
}

export interface LocalEmbeddingProgressMessage {
  type: 'model-loading-progress';
  progress?: number;
  status?: string;
  file?: string;
}

async function getExtractorInstance(onProgress?: (data: any) => void) {
  if (!extractorPipeline) {
    extractorPipeline = await pipeline('feature-extraction', LOCAL_EMBEDDING_CONFIG.modelName, {
      quantized: LOCAL_EMBEDDING_CONFIG.quantized,
      progress_callback: (progressData: any) => {
        if (onProgress && progressData) {
          onProgress(progressData);
        }
      },
    });
  }
  return extractorPipeline;
}

function l2Normalize(vector: number[]): number[] {
  let sumSq = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSq += vector[i] * vector[i];
  }
  const norm = Math.sqrt(sumSq) || 1.0;
  return vector.map((v) => v / norm);
}

self.onmessage = async (event: MessageEvent<LocalEmbeddingWorkerRequest>) => {
  const { id, texts } = event.data;
  if (!texts || texts.length === 0) {
    self.postMessage({ id, embeddings: [] } as LocalEmbeddingWorkerResponse);
    return;
  }

  try {
    const extractor = await getExtractorInstance((progressInfo) => {
      self.postMessage({
        type: 'model-loading-progress',
        progress: progressInfo.progress,
        status: progressInfo.status,
        file: progressInfo.file,
      } as LocalEmbeddingProgressMessage);
    });

    const embeddings: number[][] = [];

    for (const text of texts) {
      // E5 models expect "passage: " prefix for indexing or "query: " for searching
      const formattedText = text.startsWith('query:') || text.startsWith('passage:') ? text : `passage: ${text}`;
      const output = await extractor(formattedText, { pooling: 'mean', normalize: true });
      const rawVector = Array.from(output.data as Float32Array);
      const normalizedVector = l2Normalize(rawVector);
      embeddings.push(normalizedVector);
    }

    self.postMessage({ id, embeddings } as LocalEmbeddingWorkerResponse);
  } catch (err: any) {
    console.error('[LocalEmbeddingWorker] Pipeline execution error:', err);
    self.postMessage({ id, error: err.message || String(err) } as LocalEmbeddingWorkerResponse);
  }
};
