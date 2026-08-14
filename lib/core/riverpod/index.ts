/**
 * Core Riverpod Module for MedAnki
 */
export {
  StateNotifier,
  StateNotifierProvider,
  stateNotifierProvider,
  useRiverpodState,
  useRiverpodNotifier,
  useRiverpod,
} from '@/src/core/riverpod';
export type { Listener } from '@/src/core/riverpod';

// Background Web Worker NER providers & reactive hooks
export { NERStateNotifier, nerStateProvider } from './nerProvider';
export type { NERState } from './nerProvider';
export { useNER, useNERWorker } from './useNER';
export type { UseNERWorkerResult } from './useNER';

// Background Semantic Vector Search providers & reactive hooks
export {
  SemanticSearchStateNotifier,
  semanticSearchProvider,
} from './semanticSearchProvider';
export type { SemanticSearchState } from './semanticSearchProvider';
export {
  useSemanticSearch,
  useSemanticSearchNotifier,
} from './useSemanticSearch';
export type { UseSemanticSearchResult } from './useSemanticSearch';
