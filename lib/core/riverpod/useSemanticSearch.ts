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
  queryText: string;
  error: string | null;
  embeddingsCount: number;
  searchByText: (text: string, topK?: number, minScore?: number) => Promise<SemanticSearchResult[]>;
  search: (queryVector: number[], topK?: number, minScore?: number) => Promise<SemanticSearchResult[]>;
  loadEmbeddings: (embeddings?: DocumentEmbeddingItem[]) => Promise<number>;
  reset: () => void;
}

/**
 * Custom React Hook to perform fast offline semantic search
 * (text -> local E5 embedding -> worker cosine similarity) via Riverpod.
 */
export function useSemanticSearch(): UseSemanticSearchResult {
  const [state, notifier] = useRiverpod(semanticSearchProvider);

  const searchByText = useCallback(
    (text: string, topK = 5, minScore = 0) =>
      notifier.searchByText(text, topK, minScore),
    [notifier]
  );

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
    queryText: state.queryText,
    error: state.error,
    embeddingsCount: state.embeddingsCount,
    searchByText,
    search,
    loadEmbeddings,
    reset,
  };
}

export function useSemanticSearchNotifier(): {
  notifier: SemanticSearchStateNotifier;
  searchByText: (text: string, topK?: number, minScore?: number) => Promise<SemanticSearchResult[]>;
  search: (queryVector: number[], topK?: number, minScore?: number) => Promise<SemanticSearchResult[]>;
  loadEmbeddings: (embeddings?: DocumentEmbeddingItem[]) => Promise<number>;
} {
  const notifier = useRiverpodNotifier(semanticSearchProvider);
  return {
    notifier,
    searchByText: (text: string, topK = 5, minScore = 0) =>
      notifier.searchByText(text, topK, minScore),
    search: (queryVector: number[], topK = 5, minScore = 0) =>
      notifier.search(queryVector, topK, minScore),
    loadEmbeddings: (embeddings?: DocumentEmbeddingItem[]) =>
      notifier.loadEmbeddings(embeddings),
  };
}
