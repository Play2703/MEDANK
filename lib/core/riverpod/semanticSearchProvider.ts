import { StateNotifier, stateNotifierProvider } from '../../../src/core/riverpod';
import {
  nerWorkerClient,
  NERWorkerClient,
  DocumentEmbeddingItem,
  SemanticSearchResult,
} from '../engines';

export interface SemanticSearchState {
  isSearching: boolean;
  results: SemanticSearchResult[];
  queryText: string;
  error: string | null;
  lastSearchedAt: number | null;
  embeddingsCount: number;
}

const initialSemanticSearchState: SemanticSearchState = {
  isSearching: false,
  results: [],
  queryText: '',
  error: null,
  lastSearchedAt: null,
  embeddingsCount: 0,
};

export class SemanticSearchStateNotifier extends StateNotifier<SemanticSearchState> {
  private client: NERWorkerClient;
  private currentSearchId = 0;

  constructor(client: NERWorkerClient = nerWorkerClient) {
    super(initialSemanticSearchState);
    this.client = client;
  }

  /**
   * Primary Search API for UI: takes raw text, converts to vector via local E5 model in real-time
   * (with asymmetric "query: " prefix), and dispatches vector cosine similarity search to background worker.
   */
  public async searchByText(
    text: string,
    topK = 5,
    minScore = 0
  ): Promise<SemanticSearchResult[]> {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      this.state = {
        ...this.state,
        results: [],
        queryText: '',
        error: null,
      };
      return [];
    }

    const searchId = ++this.currentSearchId;
    this.state = {
      ...this.state,
      isSearching: true,
      queryText: trimmed,
      error: null,
    };

    try {
      const results = await this.client.searchByText(trimmed, topK, minScore);

      if (searchId === this.currentSearchId) {
        this.state = {
          ...this.state,
          isSearching: false,
          results,
          error: null,
          lastSearchedAt: Date.now(),
        };
      }
      return results;
    } catch (err: any) {
      if (searchId === this.currentSearchId) {
        this.state = {
          ...this.state,
          isSearching: false,
          error: err?.message || 'Error executing text semantic search in worker',
        };
      }
      throw err;
    }
  }

  /**
   * Low-Level Vector Search API: directly accepts a pre-computed float query vector.
   */
  public async search(
    queryVector: number[],
    topK = 5,
    minScore = 0
  ): Promise<SemanticSearchResult[]> {
    if (!queryVector || queryVector.length === 0) {
      this.state = {
        ...this.state,
        results: [],
        error: null,
      };
      return [];
    }

    const searchId = ++this.currentSearchId;
    this.state = {
      ...this.state,
      isSearching: true,
      error: null,
    };

    try {
      const results = await this.client.searchSemantically(queryVector, topK, minScore);

      if (searchId === this.currentSearchId) {
        this.state = {
          ...this.state,
          isSearching: false,
          results,
          error: null,
          lastSearchedAt: Date.now(),
        };
      }
      return results;
    } catch (err: any) {
      if (searchId === this.currentSearchId) {
        this.state = {
          ...this.state,
          isSearching: false,
          error: err?.message || 'Error executing semantic search in worker',
        };
      }
      throw err;
    }
  }

  /**
   * Loads or updates document embeddings in the background worker
   */
  public async loadEmbeddings(embeddings?: DocumentEmbeddingItem[]): Promise<number> {
    try {
      const count = await this.client.loadEmbeddings(embeddings);
      this.state = {
        ...this.state,
        embeddingsCount: count,
      };
      return count;
    } catch (err: any) {
      console.warn('[SemanticSearchStateNotifier] Failed to load embeddings in worker:', err);
      return this.state.embeddingsCount;
    }
  }

  public reset(): void {
    this.state = initialSemanticSearchState;
  }
}

export const semanticSearchProvider = stateNotifierProvider<
  SemanticSearchStateNotifier,
  SemanticSearchState
>(() => new SemanticSearchStateNotifier());
