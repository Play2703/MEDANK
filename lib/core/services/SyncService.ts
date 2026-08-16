import { Network } from '@capacitor/network';
import {
  nativeSQLiteService,
  NativeSQLiteService,
  ActionQueueRow,
} from './NativeSQLiteService';
import { db } from '../../../src/data/db/database';


export type ActionType =
  | 'ANSWER_QUESTION'
  | 'REVIEW_FLASHCARD'
  | 'SAVE_CARD'
  | 'UPDATE_CARD'
  | 'DELETE_CARD'
  | 'SAVE_STUDY_LOG'
  | 'SAVE_QUESTION_SET'
  | 'SYNC_METRICS';

export interface QueuedActionPayloadMap {
  ANSWER_QUESTION: {
    questionId: string;
    setId: string;
    selectedOptionId: string;
    isCorrect: boolean;
    answeredAt: string;
    metadata?: Record<string, any>;
  };
  REVIEW_FLASHCARD: {
    cardId: string;
    deckId: string;
    rating: string | number;
    sm2State: any;
    timeSpentSeconds: number;
    reviewedAt: string;
  };
  SAVE_CARD: {
    card: any;
  };
  UPDATE_CARD: {
    card: any;
  };
  DELETE_CARD: {
    cardId: string;
  };
  SAVE_STUDY_LOG: {
    log: any;
  };
  SAVE_QUESTION_SET: {
    set: any;
  };
  SYNC_METRICS: {
    metrics: any;
  };
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface SyncProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

export type SyncStatusListener = (status: SyncStatus) => void;

/**
 * High-Performance Offline-First Sync Service
 * 1. Immediately writes user actions to native SQLite Action Queue (0ms UI lag).
 * 2. Monitors network connectivity with @capacitor/network.
 * 3. Silently syncs pending SQLite actions to backend in background once online.
 */
export class SyncService {
  private sqlite: NativeSQLiteService;
  private isOnline = true;
  private isSyncing = false;
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;
  private listeners: Set<SyncStatusListener> = new Set();
  private networkListenerInitialized = false;

  constructor(sqlite: NativeSQLiteService = nativeSQLiteService) {
    this.sqlite = sqlite;
    this.initNetworkMonitoring();
  }

  private async initNetworkMonitoring(): Promise<void> {
    if (this.networkListenerInitialized) return;
    this.networkListenerInitialized = true;

    try {
      if (typeof window !== 'undefined' || typeof navigator !== 'undefined') {
        const status = await Network.getStatus();
        this.isOnline = status.connected;

        Network.addListener('networkStatusChange', (netStatus) => {
          const wasOffline = !this.isOnline;
          this.isOnline = netStatus.connected;
          this.notifyStatus();

          // Auto-trigger background sync as soon as connectivity is restored
          if (wasOffline && this.isOnline) {
            console.log('[SyncService] Connection restored. Triggering background sync queue...');
            this.processQueue().catch((err) => {
              console.warn('[SyncService] Auto-sync failed upon reconnect:', err);
            });
          }
        });
      }
    } catch (err) {
      console.warn('[SyncService] Network monitoring initialization error (running in fallback mode):', err);
    }
  }

  public getStatus(): SyncStatus {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingCount: 0, // dynamic count accessible via getQueueStats
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
    };
  }

  public addListener(listener: SyncStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyStatus(): void {
    const current = this.getStatus();
    this.listeners.forEach((fn) => {
      try {
        fn(current);
      } catch (err) {
        console.error('[SyncService] Error in sync listener callback:', err);
      }
    });
  }

  /**
   * Enqueues an action immediately into local native SQLite table (instant execution)
   */
  public async enqueueAction<T extends ActionType>(
    actionType: T,
    payload: QueuedActionPayloadMap[T] | any
  ): Promise<string> {
    const id = `act_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const actionRow: ActionQueueRow = {
      id,
      action_type: actionType,
      payload: JSON.stringify(payload),
      created_at: new Date().toISOString(),
      status: 'pending',
      retry_count: 0,
      error_message: null,
      synced_at: null,
    };

    // 1. Write IMMEDIATELY to Native SQLite
    await this.sqlite.insertAction(actionRow);

    // 2. If online and not already syncing, kick off background sync silently
    if (this.isOnline && !this.isSyncing) {
      // Run in background without awaiting to keep UI at 60fps
      queueMicrotask(() => {
        this.processQueue().catch((err) => {
          console.debug('[SyncService] Background sync caught non-critical error:', err);
        });
      });
    }

    return id;
  }

  /**
   * Records a Flashcard review immediately to SQLite Action Queue
   */
  public async recordFlashcardReview(
    cardId: string,
    deckId: string,
    rating: string | number,
    sm2State: any,
    timeSpentSeconds = 0
  ): Promise<string> {
    const reviewedAt = new Date().toISOString();

    // Cache to SQLite immediately
    await this.sqlite.insertCachedHistory({
      id: `rev_${Date.now()}_${cardId}`,
      card_id: cardId,
      deck_id: deckId,
      rating: String(rating),
      reviewed_at: reviewedAt,
      data_json: JSON.stringify({ cardId, deckId, rating, sm2State, timeSpentSeconds, reviewedAt }),
    });

    return await this.enqueueAction('REVIEW_FLASHCARD', {
      cardId,
      deckId,
      rating,
      sm2State,
      timeSpentSeconds,
      reviewedAt,
    });
  }

  /**
   * Records a Question answer immediately to SQLite Action Queue
   */
  public async recordQuestionAnswer(
    questionId: string,
    setId: string,
    selectedOptionId: string,
    isCorrect: boolean,
    metadata?: Record<string, any>
  ): Promise<string> {
    const answeredAt = new Date().toISOString();

    return await this.enqueueAction('ANSWER_QUESTION', {
      questionId,
      setId,
      selectedOptionId,
      isCorrect,
      answeredAt,
      metadata,
    });
  }

  /**
   * Processes the Action Queue silently in background
   */
  public async processQueue(batchSize = 50): Promise<SyncProcessResult> {
    if (this.isSyncing) {
      return { processed: 0, succeeded: 0, failed: 0, errors: [] };
    }

    this.isSyncing = true;
    this.lastError = null;
    this.notifyStatus();

    const result: SyncProcessResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    };

    try {
      const pending = await this.sqlite.getPendingActions(batchSize);
      if (pending.length === 0) {
        this.isSyncing = false;
        this.notifyStatus();
        return result;
      }

      for (const item of pending) {
        result.processed++;
        await this.sqlite.updateActionStatus(item.id, 'processing');

        try {
          // Send to remote backend or persist across synced stores
          await this.dispatchRemoteSync(item);

          await this.sqlite.updateActionStatus(item.id, 'synced');
          result.succeeded++;
        } catch (err: any) {
          result.failed++;
          const errorMsg = err?.message || 'Sync failed';
          result.errors.push({ id: item.id, error: errorMsg });
          await this.sqlite.updateActionStatus(item.id, 'failed', errorMsg);
        }
      }

      this.lastSyncedAt = new Date().toISOString();
      // Periodically clean up old synced actions (older than 24 hours)
      await this.sqlite.clearSyncedActions();
    } catch (err: any) {
      this.lastError = err?.message || 'Sync process failed';
      console.warn('[SyncService] Error processing queue:', err);
    } finally {
      this.isSyncing = false;
      this.notifyStatus();
    }

    return result;
  }

  /**
   * Dispatches an individual action payload to the server / cloud storage
   */
  private async dispatchRemoteSync(action: ActionQueueRow): Promise<void> {
    const payload = JSON.parse(action.payload);

    // If fetch/server endpoint is available, transmit payload
    if (typeof fetch === 'function') {
      try {
        const response = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actionId: action.id,
            actionType: action.action_type,
            payload,
            createdAt: action.created_at,
          }),
        });

        if (response.ok) {
          return;
        }
        // If /api/sync endpoint returns 404/500 (e.g. running purely client-side/offline mock),
        // we persist to Dexie as durable local source of truth without throwing fatal error
        if (response.status === 404) {
          await this.fallbackDexieSync(action.action_type as ActionType, payload);
          return;
        }
      } catch (networkErr: any) {
        // Offline or connection refused
        if (this.isOnline) {
          // If browser reports online but localhost/backend is not serving /api/sync, fallback safely
          await this.fallbackDexieSync(action.action_type as ActionType, payload);
          return;
        }
        throw networkErr;
      }
    } else {
      await this.fallbackDexieSync(action.action_type as ActionType, payload);
    }
  }

  /**
   * Fallback syncing to Dexie indexedDB if backend sync endpoint is unavailable
   */
  private async fallbackDexieSync(actionType: ActionType, payload: any): Promise<void> {
    switch (actionType) {
      case 'REVIEW_FLASHCARD': {
        if (payload.cardId && payload.sm2State) {
          const existing = await db.flashcards.get(payload.cardId);
          if (existing) {
            await db.flashcards.update(payload.cardId, {
              sm2State: payload.sm2State,
              updatedAt: new Date().toISOString(),
            });
          }
        }
        break;
      }
      case 'ANSWER_QUESTION': {
        if (payload.setId && payload.questionId) {
          const set = await db.questionSets.get(payload.setId);
          if (set) {
            const updatedQuestions = set.questions.map((q) => {
              if (q.id === payload.questionId) {
                return {
                  ...q,
                  isAnswered: true,
                  userAnswerId: payload.selectedOptionId,
                  isCorrect: payload.isCorrect,
                  answeredAt: payload.answeredAt,
                };
              }
              return q;
            });
            const answeredCount = updatedQuestions.filter((q) => q.isAnswered).length;
            const correctCount = updatedQuestions.filter((q) => q.isCorrect).length;

            await db.questionSets.update(payload.setId, {
              questions: updatedQuestions,
              answeredCount,
              correctCount,
              updatedAt: new Date().toISOString(),
            });
          }
        }
        break;
      }
      case 'SAVE_CARD':
      case 'UPDATE_CARD': {
        if (payload.card) {
          await db.flashcards.put(payload.card);
        }
        break;
      }
      case 'DELETE_CARD': {
        if (payload.cardId) {
          await db.flashcards.delete(payload.cardId);
        }
        break;
      }
      case 'SAVE_STUDY_LOG': {
        if (payload.log) {
          await db.studyHistory.put(payload.log);
        }
        break;
      }
      case 'SAVE_QUESTION_SET': {
        if (payload.set) {
          await db.questionSets.put(payload.set);
        }
        break;
      }
      case 'SYNC_METRICS': {
        if (payload.metrics || payload.stats) {
          await db.revisionStats.put(payload.metrics || payload.stats);
        }
        break;
      }
      default:
        break;
    }
  }

  public async getPendingActions(): Promise<ActionQueueRow[]> {
    return await this.sqlite.getPendingActions();
  }

  public async getQueueStats(): Promise<{ pending: number; failed: number; synced: number; total: number }> {
    return await this.sqlite.getActionQueueStats();
  }

  public async clearSyncedActions(): Promise<void> {
    await this.sqlite.clearSyncedActions();
  }
}

export const syncService = new SyncService();
