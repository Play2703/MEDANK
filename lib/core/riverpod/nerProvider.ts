import { StateNotifier, stateNotifierProvider } from '../../../src/core/riverpod';

import {
  nerWorkerClient,
  NERWorkerClient,
  MatchedEntity,
  ExtractedRelation,
  NERAnalysisResult,
} from '../engines';

export interface NERState {
  isProcessing: boolean;
  text: string;
  entities: MatchedEntity[];
  relations: ExtractedRelation[];
  coverage: number;
  error: string | null;
  lastProcessedAt: number | null;
}

const initialNERState: NERState = {
  isProcessing: false,
  text: '',
  entities: [],
  relations: [],
  coverage: 0,
  error: null,
  lastProcessedAt: null,
};

export class NERStateNotifier extends StateNotifier<NERState> {
  private client: NERWorkerClient;
  private currentRequestId = 0;

  constructor(client: NERWorkerClient = nerWorkerClient) {
    super(initialNERState);
    this.client = client;
  }

  /**
   * Processes text through the Web Worker asynchronously without blocking UI thread.
   */
  public async analyzeText(text: string): Promise<NERAnalysisResult> {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      const emptyResult: NERAnalysisResult = { text: '', entities: [], relations: [], coverage: 0 };
      this.state = {
        ...initialNERState,
        text: '',
      };
      return emptyResult;
    }

    const reqId = ++this.currentRequestId;
    this.state = {
      ...this.state,
      isProcessing: true,
      text: trimmed,
      error: null,
    };

    try {
      const result = await this.client.analyzeText(trimmed);

      // Avoid race conditions if a newer analysis was requested
      if (reqId === this.currentRequestId) {
        this.state = {
          isProcessing: false,
          text: trimmed,
          entities: result.entities,
          relations: result.relations,
          coverage: result.coverage,
          error: null,
          lastProcessedAt: Date.now(),
        };
      }
      return result;
    } catch (err: any) {
      if (reqId === this.currentRequestId) {
        this.state = {
          ...this.state,
          isProcessing: false,
          error: err?.message || 'Error processing NER in background worker',
        };
      }
      throw err;
    }
  }

  /**
   * Fast entities-only extraction via background worker
   */
  public async extractEntities(text: string): Promise<MatchedEntity[]> {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      this.state = { ...this.state, entities: [], text: '' };
      return [];
    }

    this.state = { ...this.state, isProcessing: true, error: null };
    try {
      const entities = await this.client.extractEntities(trimmed);
      this.state = {
        ...this.state,
        isProcessing: false,
        entities,
        lastProcessedAt: Date.now(),
      };
      return entities;
    } catch (err: any) {
      this.state = {
        ...this.state,
        isProcessing: false,
        error: err?.message || 'Error extracting entities in worker',
      };
      throw err;
    }
  }

  public reset(): void {
    this.state = initialNERState;
  }
}

export const nerStateProvider = stateNotifierProvider<NERStateNotifier, NERState>(
  () => new NERStateNotifier()
);
