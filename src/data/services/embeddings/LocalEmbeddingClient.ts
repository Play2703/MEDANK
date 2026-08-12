import type {
  LocalEmbeddingWorkerRequest,
  LocalEmbeddingWorkerResponse,
  LocalEmbeddingProgressMessage,
} from './localEmbedding.worker';
import { LOCAL_EMBEDDING_CONFIG } from './localEmbeddingConfig';

export class LocalEmbeddingClient {
  private workerInstance: Worker | null = null;
  private requestIdCounter = 0;
  private pendingRequests = new Map<number, (embeddings: number[][]) => void>();
  private progressCallbacks = new Set<(progress: number) => void>();
  private nodeExtractorPipeline: any = null;

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return;
    }

    try {
      this.workerInstance = new Worker(
        new URL('./localEmbedding.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.workerInstance.onmessage = (event: MessageEvent<LocalEmbeddingWorkerResponse | LocalEmbeddingProgressMessage>) => {
        const data = event.data;
        if ('type' in data && data.type === 'model-loading-progress') {
          if (typeof data.progress === 'number') {
            this.progressCallbacks.forEach((cb) => cb(data.progress || 0));
          }
          return;
        }

        const res = data as LocalEmbeddingWorkerResponse;
        const resolver = this.pendingRequests.get(res.id);
        if (resolver) {
          this.pendingRequests.delete(res.id);
          resolver(res.embeddings || []);
        }
      };

      this.workerInstance.onerror = (err) => {
        console.warn('[LocalEmbeddingClient] Web Worker error:', err);
      };
    } catch (err) {
      console.warn('[LocalEmbeddingClient] Worker initialization failed, will use fallback:', err);
      this.workerInstance = null;
    }
  }

  public onProgress(callback: (progress: number) => void): () => void {
    this.progressCallbacks.add(callback);
    return () => this.progressCallbacks.delete(callback);
  }

  public async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) return [];

    // Fallback for non-Worker environment (Node / Vitest test suite / Seed Script)
    if (!this.workerInstance) {
      try {
        if (!this.nodeExtractorPipeline) {
          // Sharp é um módulo nativo opcional de imagens do transformers.js.
          // No Node.js, o require('sharp') pode lançar exceção se o binário nativo não estiver compilado.
          // Interceptamos temporariamente para retornar null se falhar, permitindo extração de texto 100% pura.
          if (typeof process !== 'undefined' && process.versions && process.versions.node) {
            try {
              const Module = await import('module');
              const origRequire = Module.default.prototype.require;
              Module.default.prototype.require = function (id: string) {
                if (id === 'sharp') return {};
                return origRequire.apply(this, arguments as any);
              };
            } catch {}
          }

          const { pipeline, env } = await import('@xenova/transformers');
          env.allowLocalModels = false;
          this.nodeExtractorPipeline = await pipeline(
            'feature-extraction',
            LOCAL_EMBEDDING_CONFIG.modelName,
            { quantized: LOCAL_EMBEDDING_CONFIG.quantized }
          );
        }

        const embeddings: number[][] = [];
        for (const text of texts) {
          const formattedText = text.startsWith('query:') || text.startsWith('passage:') ? text : `passage: ${text}`;
          const output = await this.nodeExtractorPipeline(formattedText, { pooling: 'mean', normalize: true });
          const rawVector = Array.from(output.data as Float32Array);
          let sumSq = 0;
          for (let i = 0; i < rawVector.length; i++) {
            sumSq += rawVector[i] * rawVector[i];
          }
          const norm = Math.sqrt(sumSq) || 1.0;
          embeddings.push(rawVector.map((v) => v / norm));
        }
        return embeddings;
      } catch (nodeErr) {
        console.warn('[LocalEmbeddingClient] Node transformers.js execution error, using local math fallback:', nodeErr);
        return texts.map((t) => {
          const vec = new Array(LOCAL_EMBEDDING_CONFIG.outputDimension).fill(0);
          for (let i = 0; i < t.length; i++) {
            vec[i % LOCAL_EMBEDDING_CONFIG.outputDimension] += t.charCodeAt(i) / 255.0;
          }
          const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
          return vec.map((v) => v / norm);
        });
      }
    }

    return new Promise((resolve) => {
      const reqId = ++this.requestIdCounter;
      this.pendingRequests.set(reqId, resolve);
      const reqMsg: LocalEmbeddingWorkerRequest = {
        id: reqId,
        texts,
      };
      this.workerInstance!.postMessage(reqMsg);
    });
  }
}

export const localEmbeddingClient = new LocalEmbeddingClient();

