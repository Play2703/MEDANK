import {
  MatchedEntity,
  ExtractedRelation,
  NERAnalysisResult,
  DocumentEmbeddingItem,
  SemanticSearchResult,
  NERWorkerRequest,
  NERWorkerRequestInput,
  NERWorkerResponse,
  WorkerNEREngine,
} from './ner.worker';

/**
 * High-Performance Asynchronous NER & Semantic Search Client
 * Offloads NER processing and Vector Cosine Similarity to Web Worker in background thread
 * to guarantee 60fps UI performance.
 * Provides zero-cost graceful fallback in SSR or Node/Vitest test environments.
 */
export class NERWorkerClient {
  private worker: Worker | null = null;
  private fallbackEngine: WorkerNEREngine | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (reason?: any) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private requestCounter = 0;
  private isInitialized = false;

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        // Vite syntax for web worker instantiation
        this.worker = new Worker(new URL('./ner.worker.ts', import.meta.url), {
          type: 'module',
        });

        this.worker.onmessage = (event: MessageEvent<NERWorkerResponse>) => {
          this.handleWorkerResponse(event.data);
        };

        this.worker.onerror = (err) => {
          console.warn('[NERWorkerClient] Worker error, falling back to local thread engine:', err);
          this.fallbackEngine = new WorkerNEREngine();
        };

        this.isInitialized = true;
        return;
      } catch (e) {
        console.warn('[NERWorkerClient] Web Worker initialization failed, using in-process engine:', e);
      }
    }

    // Fallback for Node / Vitest / SSR environments
    this.fallbackEngine = new WorkerNEREngine();
    this.isInitialized = true;
  }

  private handleWorkerResponse(response: NERWorkerResponse): void {
    if (!response || !response.id) return;
    const pending = this.pendingRequests.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingRequests.delete(response.id);

    if (response.type === 'ERROR') {
      pending.reject(new Error(response.error));
      return;
    }

    switch (response.type) {
      case 'INIT_SUCCESS':
        pending.resolve(true);
        break;
      case 'EXTRACT_ENTITIES_SUCCESS':
        pending.resolve(response.entities);
        break;
      case 'EXTRACT_RELATIONS_SUCCESS':
        pending.resolve(response.relations);
        break;
      case 'ANALYZE_TEXT_SUCCESS':
        pending.resolve(response.result);
        break;
      case 'LOAD_EMBEDDINGS_SUCCESS':
        pending.resolve(response.count);
        break;
      case 'SEMANTIC_SEARCH_SUCCESS':
        pending.resolve(response.results);
        break;
      default:
        pending.reject(new Error('Unknown response type'));
    }
  }

  private postRequest<T>(req: NERWorkerRequestInput, timeoutMs = 15000): Promise<T> {
    const id = `ner_req_${Date.now()}_${++this.requestCounter}`;
    const fullRequest = { ...req, id } as NERWorkerRequest;

    if (!this.worker || this.fallbackEngine) {
      // Execute in-process asynchronously via microtask queue
      return new Promise<T>((resolve, reject) => {
        queueMicrotask(() => {
          try {
            if (!this.fallbackEngine) {
              this.fallbackEngine = new WorkerNEREngine();
            }

            if (fullRequest.type === 'EXTRACT_ENTITIES') {
              const entities = this.fallbackEngine.extractEntities(fullRequest.text);
              resolve(entities as unknown as T);
            } else if (fullRequest.type === 'EXTRACT_RELATIONS') {
              const relations = this.fallbackEngine.extractRelations(fullRequest.text, fullRequest.entities);
              resolve(relations as unknown as T);
            } else if (fullRequest.type === 'ANALYZE_TEXT') {
              const result = this.fallbackEngine.analyzeText(fullRequest.text);
              resolve(result as unknown as T);
            } else if (fullRequest.type === 'INIT') {
              if (fullRequest.payload?.customTerms) {
                this.fallbackEngine.loadTerms(fullRequest.payload.customTerms);
              }
              if (fullRequest.payload?.embeddings) {
                this.fallbackEngine.loadEmbeddings(fullRequest.payload.embeddings);
              }
              resolve(true as unknown as T);
            } else if (fullRequest.type === 'LOAD_EMBEDDINGS') {
              let count = 0;
              if (fullRequest.payload?.embeddings) {
                count = this.fallbackEngine.loadEmbeddings(fullRequest.payload.embeddings);
              } else {
                count = this.fallbackEngine.getEmbeddingsCount();
              }
              resolve(count as unknown as T);
            } else if (fullRequest.type === 'SEMANTIC_SEARCH') {
              const results = this.fallbackEngine.searchSemantically(
                fullRequest.queryVector,
                fullRequest.topK ?? 5,
                fullRequest.minScore ?? 0
              );
              resolve(results as unknown as T);
            } else {
              reject(new Error('Unsupported action in fallback engine'));
            }
          } catch (err) {
            reject(err);
          }
        });
      });
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`NER Worker request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.worker!.postMessage(fullRequest);
    });
  }

  public async initTerms(customTerms?: Array<{ term: string; category: string; codeSystem?: string; code?: string }>): Promise<boolean> {
    return this.postRequest<boolean>({ type: 'INIT', payload: { customTerms } });
  }

  public async loadEmbeddings(embeddings?: DocumentEmbeddingItem[]): Promise<number> {
    return this.postRequest<number>({ type: 'LOAD_EMBEDDINGS', payload: { embeddings } });
  }

  public async extractEntities(text: string): Promise<MatchedEntity[]> {
    if (!text || !text.trim()) return [];
    return this.postRequest<MatchedEntity[]>({ type: 'EXTRACT_ENTITIES', text });
  }

  public async extractRelations(text: string, entities: MatchedEntity[]): Promise<ExtractedRelation[]> {
    if (!text || !text.trim() || !entities || entities.length < 2) return [];
    return this.postRequest<ExtractedRelation[]>({ type: 'EXTRACT_RELATIONS', text, entities });
  }

  public async analyzeText(text: string): Promise<NERAnalysisResult> {
    if (!text || !text.trim()) {
      return { text: '', entities: [], relations: [], coverage: 0 };
    }
    return this.postRequest<NERAnalysisResult>({ type: 'ANALYZE_TEXT', text });
  }

  public async searchSemantically(
    queryVector: number[],
    topK = 5,
    minScore = 0
  ): Promise<SemanticSearchResult[]> {
    if (!queryVector || !Array.isArray(queryVector) || queryVector.length === 0) return [];
    return this.postRequest<SemanticSearchResult[]>({
      type: 'SEMANTIC_SEARCH',
      queryVector,
      topK,
      minScore,
    });
  }

  public terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.forEach(({ timer, reject }) => {
      clearTimeout(timer);
      reject(new Error('Worker terminated'));
    });
    this.pendingRequests.clear();
  }
}

export const nerWorkerClient = new NERWorkerClient();
