import { useEffect, useRef, useCallback } from 'react';
import { useRiverpod, useRiverpodState, useRiverpodNotifier } from '../../../src/core/riverpod';

import { nerStateProvider, NERState, NERStateNotifier } from './nerProvider';
import { MatchedEntity, ExtractedRelation, NERAnalysisResult } from '../engines';

export interface UseNERWorkerResult {
  state: NERState;
  isProcessing: boolean;
  entities: MatchedEntity[];
  relations: ExtractedRelation[];
  coverage: number;
  error: string | null;
  analyze: (text: string) => Promise<NERAnalysisResult>;
  extract: (text: string) => Promise<MatchedEntity[]>;
  reset: () => void;
}

/**
 * Custom React Hook to access NER background worker via Riverpod.
 * Offloads heavy NLP extraction to background thread to maintain smooth 60fps UI.
 *
 * @param autoAnalyzeText Optional text to automatically debounce & analyze on change
 * @param debounceMs Delay in ms before analyzing autoAnalyzeText (default: 300ms)
 */
export function useNER(autoAnalyzeText?: string, debounceMs = 300): UseNERWorkerResult {
  const [state, notifier] = useRiverpod(nerStateProvider);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const analyze = useCallback(
    (text: string) => notifier.analyzeText(text),
    [notifier]
  );

  const extract = useCallback(
    (text: string) => notifier.extractEntities(text),
    [notifier]
  );

  const reset = useCallback(
    () => notifier.reset(),
    [notifier]
  );

  useEffect(() => {
    if (typeof autoAnalyzeText === 'string') {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        analyze(autoAnalyzeText).catch((err) => {
          console.debug('[useNER] Auto-analyze caught error:', err);
        });
      }, debounceMs);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [autoAnalyzeText, debounceMs, analyze]);

  return {
    state,
    isProcessing: state.isProcessing,
    entities: state.entities,
    relations: state.relations,
    coverage: state.coverage,
    error: state.error,
    analyze,
    extract,
    reset,
  };
}

/**
 * Access NER worker notifier directly for programmatic background extraction
 */
export function useNERWorker(): {
  notifier: NERStateNotifier;
  analyze: (text: string) => Promise<NERAnalysisResult>;
  extract: (text: string) => Promise<MatchedEntity[]>;
} {
  const notifier = useRiverpodNotifier(nerStateProvider);
  return {
    notifier,
    analyze: (text: string) => notifier.analyzeText(text),
    extract: (text: string) => notifier.extractEntities(text),
  };
}
