import { useCallback } from 'react';
import { useRiverpod, useRiverpodNotifier } from '../../../src/core/riverpod';
import {
  semanticSearchProvider,
  SemanticSearchState,
  SemanticSearchStateNotifier,
} from './semanticSearchProvider';
import { DocumentEmbeddingItem, SemanticSearchResult } from '../engines';

export interface UseSemanticSearchResult {
  state: SemanticSearchState;
  isSearching: boolean;
  results: SemanticSearchResult[];
  error: string | null;
  embeddingsCount: number;
  search: (queryVector: number[], topK?: number, minScore?: number) => Promise<SemanticSearchResult[]>;
  loadEmbeddings: (embeddings?: DocumentEmbeddingItem[]) => Promise<number>;
  reset: () => void;
}

/**
 * Custom React Hook to perform fast offline vector cosine similarity search
 * in the background Web Worker via Riverpod.
 */
export function useSemanticSearch(): UseSemanticSearchResult {
  const [state, notifier] = useRiverpod(semanticSearchProvider);

  const search = useCallback(
    (queryVector: number[], topK = 5, minScore = 0) =>
      notifier.search(queryVector, topK, minScore),
    [notifier]
  );

  const loadEmbeddings = useCallback(
    (embeddings?: DocumentEmbeddingItem[]) => notifier.loadEmbeddings(embeddings),
    [notifier]
  );

  const reset = useCallback(() => notifier.reset(), [notifier]);

  return {
    state,
    isSearching: state.isSearching,
    results: state.results,
    error: state.error,
    embeddingsCount: state.embeddingsCount,
    search,
    loadEmbeddings,
    reset,
  };
}

export function useSemanticSearchNotifier(): {
  notifier: SemanticSearchStateNotifier;
  search: (queryVector: number[], topK?: number, minScore?: number) => Promise<SemanticSearchResult[]>;
  loadEmbeddings: (embeddings?: DocumentEmbeddingItem[]) => Promise<number>;
} {
  const notifier = useRiverpodNotifier(semanticSearchProvider);
  return {
    notifier,
    search: (queryVector: number[], topK = 5, minScore = 0) =>
      notifier.search(queryVector, topK, minScore),
    loadEmbeddings: (embeddings?: DocumentEmbeddingItem[]) =>
      notifier.loadEmbeddings(embeddings),
  };
}
