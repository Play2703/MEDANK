import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

export interface ActionQueueRow {
  id: string;
  action_type: string;
  payload: string;
  created_at: string;
  status: 'pending' | 'processing' | 'synced' | 'failed';
  retry_count: number;
  error_message?: string | null;
  synced_at?: string | null;
}

export interface CachedFlashcardRow {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  due_date: string;
  sm2_state: string;
  updated_at: string;
  data_json: string;
}

export interface CachedQuestionRow {
  id: string;
  set_id: string;
  category: string;
  difficulty: string;
  data_json: string;
  updated_at: string;
}

export interface CachedHistoryRow {
  id: string;
  card_id: string;
  deck_id: string;
  rating: string;
  reviewed_at: string;
  data_json: string;
}

export interface CachedStatsRow {
  deck_id: string;
  data_json: string;
  updated_at: string;
}

/**
 * High-Performance Native SQLite Service for Capacitor (iOS/Android)
 * with robust in-memory/web fallback for non-native platforms and unit tests.
 */
export class NativeSQLiteService {
  private sqliteConnection: SQLiteConnection | null = null;
  private dbConnection: SQLiteDBConnection | null = null;
  private dbName = 'medanki_offline';
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  // In-memory tables for Web/Test fallback
  private memActionQueue = new Map<string, ActionQueueRow>();
  private memCards = new Map<string, CachedFlashcardRow>();
  private memQuestions = new Map<string, CachedQuestionRow>();
  private memHistory = new Map<string, CachedHistoryRow>();
  private memStats = new Map<string, CachedStatsRow>();

  constructor() {}

  public isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        if (this.isNative()) {
          this.sqliteConnection = new SQLiteConnection(CapacitorSQLite);
          const isConsistent = (await this.sqliteConnection.checkConnectionsConsistency()).result;
          const isConn = (await this.sqliteConnection.isConnection(this.dbName, false)).result;

          if (isConsistent && isConn) {
            this.dbConnection = await this.sqliteConnection.retrieveConnection(this.dbName, false);
          } else {
            this.dbConnection = await this.sqliteConnection.createConnection(
              this.dbName,
              false,
              'no-encryption',
              1,
              false
            );
          }

          await this.dbConnection.open();
          await this.createNativeTables();
        } else {
          // Non-native fallback initialized
          this.initMemoryStore();
        }
        this.isInitialized = true;
      } catch (err) {
        console.warn('[NativeSQLiteService] Native SQLite initialization failed, using high-speed in-memory store:', err);
        this.initMemoryStore();
        this.isInitialized = true;
      }
    })();

    return this.initPromise;
  }

  private async createNativeTables(): Promise<void> {
    if (!this.dbConnection) return;

    const schema = `
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS action_queue (
        id TEXT PRIMARY KEY,
        action_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        error_message TEXT,
        synced_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_action_queue_status_created ON action_queue(status, created_at);

      CREATE TABLE IF NOT EXISTS cached_flashcards (
        id TEXT PRIMARY KEY,
        deck_id TEXT NOT NULL,
        front TEXT,
        back TEXT,
        due_date TEXT,
        sm2_state TEXT,
        updated_at TEXT NOT NULL,
        data_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cached_cards_deck ON cached_flashcards(deck_id);
      CREATE INDEX IF NOT EXISTS idx_cached_cards_due ON cached_flashcards(due_date);

      CREATE TABLE IF NOT EXISTS cached_questions (
        id TEXT PRIMARY KEY,
        set_id TEXT,
        category TEXT,
        difficulty TEXT,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cached_questions_set ON cached_questions(set_id);

      CREATE TABLE IF NOT EXISTS cached_study_history (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        deck_id TEXT NOT NULL,
        rating TEXT NOT NULL,
        reviewed_at TEXT NOT NULL,
        data_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cached_hist_deck ON cached_study_history(deck_id, reviewed_at);

      CREATE TABLE IF NOT EXISTS cached_stats (
        deck_id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `;

    await this.dbConnection.execute(schema);
  }

  private initMemoryStore(): void {
    // Memory tables are ready by default Map instances
  }

  // --- ACTION QUEUE OPERATIONS ---

  public async insertAction(action: ActionQueueRow): Promise<void> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = `
        INSERT OR REPLACE INTO action_queue (id, action_type, payload, created_at, status, retry_count, error_message, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await this.dbConnection.run(sql, [
        action.id,
        action.action_type,
        action.payload,
        action.created_at,
        action.status,
        action.retry_count,
        action.error_message || null,
        action.synced_at || null,
      ]);
    } else {
      this.memActionQueue.set(action.id, { ...action });
    }
  }

  public async getPendingActions(limit = 50): Promise<ActionQueueRow[]> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = `
        SELECT * FROM action_queue
        WHERE status = 'pending' OR (status = 'failed' AND retry_count < 5)
        ORDER BY created_at ASC
        LIMIT ?
      `;
      const res = await this.dbConnection.query(sql, [limit]);
      return (res.values as ActionQueueRow[]) || [];
    } else {
      const results: ActionQueueRow[] = [];
      for (const row of this.memActionQueue.values()) {
        if (row.status === 'pending' || (row.status === 'failed' && row.retry_count < 5)) {
          results.push({ ...row });
        }
      }
      results.sort((a, b) => a.created_at.localeCompare(b.created_at));
      return results.slice(0, limit);
    }
  }

  public async getAllActions(): Promise<ActionQueueRow[]> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = 'SELECT * FROM action_queue ORDER BY created_at ASC';
      const res = await this.dbConnection.query(sql);
      return (res.values as ActionQueueRow[]) || [];
    } else {
      return Array.from(this.memActionQueue.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
  }

  public async getActionById(id: string): Promise<ActionQueueRow | null> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = 'SELECT * FROM action_queue WHERE id = ? LIMIT 1';
      const res = await this.dbConnection.query(sql, [id]);
      return res.values && res.values.length > 0 ? (res.values[0] as ActionQueueRow) : null;
    } else {
      const item = this.memActionQueue.get(id);
      return item ? { ...item } : null;
    }
  }



  public async updateActionStatus(
    id: string,
    status: ActionQueueRow['status'],
    errorMessage?: string | null
  ): Promise<void> {
    await this.initialize();
    const syncedAt = status === 'synced' ? new Date().toISOString() : null;

    if (this.dbConnection && this.isNative()) {
      let sql: string;
      let params: any[];

      if (status === 'failed') {
        sql = `
          UPDATE action_queue
          SET status = ?, retry_count = retry_count + 1, error_message = ?
          WHERE id = ?
        `;
        params = [status, errorMessage || null, id];
      } else {
        sql = `
          UPDATE action_queue
          SET status = ?, synced_at = ?, error_message = ?
          WHERE id = ?
        `;
        params = [status, syncedAt, errorMessage || null, id];
      }

      await this.dbConnection.run(sql, params);
    } else {
      const item = this.memActionQueue.get(id);
      if (item) {
        item.status = status;
        item.error_message = errorMessage || null;
        if (status === 'synced') item.synced_at = syncedAt;
        if (status === 'failed') item.retry_count += 1;
      }
    }
  }

  public async deleteAction(id: string): Promise<void> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      await this.dbConnection.run('DELETE FROM action_queue WHERE id = ?', [id]);
    } else {
      this.memActionQueue.delete(id);
    }
  }

  public async clearSyncedActions(olderThanMs = 24 * 60 * 60 * 1000): Promise<void> {
    await this.initialize();
    const thresholdISO = new Date(Date.now() - olderThanMs).toISOString();

    if (this.dbConnection && this.isNative()) {
      await this.dbConnection.run(
        'DELETE FROM action_queue WHERE status = ? AND synced_at <= ?',
        ['synced', thresholdISO]
      );
    } else {
      for (const [id, row] of this.memActionQueue.entries()) {
        if (row.status === 'synced' && row.synced_at && row.synced_at <= thresholdISO) {
          this.memActionQueue.delete(id);
        }
      }
    }
  }

  public async getActionQueueStats(): Promise<{ pending: number; failed: number; synced: number; total: number }> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const res = await this.dbConnection.query(
        `SELECT status, count(*) as count FROM action_queue GROUP BY status`
      );
      let pending = 0;
      let failed = 0;
      let synced = 0;
      for (const row of res.values || []) {
        if (row.status === 'pending') pending = row.count;
        if (row.status === 'failed') failed = row.count;
        if (row.status === 'synced') synced = row.count;
      }
      return { pending, failed, synced, total: pending + failed + synced };
    } else {
      let pending = 0;
      let failed = 0;
      let synced = 0;
      for (const row of this.memActionQueue.values()) {
        if (row.status === 'pending') pending++;
        else if (row.status === 'failed') failed++;
        else if (row.status === 'synced') synced++;
      }
      return { pending, failed, synced, total: this.memActionQueue.size };
    }
  }

  // --- CACHED FLASHCARDS OPERATIONS ---

  public async upsertCachedCard(card: CachedFlashcardRow): Promise<void> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = `
        INSERT OR REPLACE INTO cached_flashcards (id, deck_id, front, back, due_date, sm2_state, updated_at, data_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await this.dbConnection.run(sql, [
        card.id,
        card.deck_id,
        card.front,
        card.back,
        card.due_date,
        card.sm2_state,
        card.updated_at,
        card.data_json,
      ]);
    } else {
      this.memCards.set(card.id, { ...card });
    }
  }

  public async getCachedCardsByDeck(deckId: string): Promise<CachedFlashcardRow[]> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = 'SELECT * FROM cached_flashcards WHERE deck_id = ?';
      const res = await this.dbConnection.query(sql, [deckId]);
      return (res.values as CachedFlashcardRow[]) || [];
    } else {
      const cards: CachedFlashcardRow[] = [];
      for (const c of this.memCards.values()) {
        if (c.deck_id === deckId) cards.push({ ...c });
      }
      return cards;
    }
  }

  public async getCachedCardById(id: string): Promise<CachedFlashcardRow | null> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = 'SELECT * FROM cached_flashcards WHERE id = ? LIMIT 1';
      const res = await this.dbConnection.query(sql, [id]);
      return res.values && res.values.length > 0 ? (res.values[0] as CachedFlashcardRow) : null;
    } else {
      const card = this.memCards.get(id);
      return card ? { ...card } : null;
    }
  }

  public async deleteCachedCard(id: string): Promise<void> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      await this.dbConnection.run('DELETE FROM cached_flashcards WHERE id = ?', [id]);
    } else {
      this.memCards.delete(id);
    }
  }

  // --- CACHED QUESTIONS OPERATIONS ---

  public async upsertCachedQuestion(q: CachedQuestionRow): Promise<void> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = `
        INSERT OR REPLACE INTO cached_questions (id, set_id, category, difficulty, data_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      await this.dbConnection.run(sql, [
        q.id,
        q.set_id,
        q.category,
        q.difficulty,
        q.data_json,
        q.updated_at,
      ]);
    } else {
      this.memQuestions.set(q.id, { ...q });
    }
  }

  public async getCachedQuestionsBySet(setId: string): Promise<CachedQuestionRow[]> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = 'SELECT * FROM cached_questions WHERE set_id = ?';
      const res = await this.dbConnection.query(sql, [setId]);
      return (res.values as CachedQuestionRow[]) || [];
    } else {
      const list: CachedQuestionRow[] = [];
      for (const q of this.memQuestions.values()) {
        if (q.set_id === setId) list.push({ ...q });
      }
      return list;
    }
  }

  // --- CACHED STUDY HISTORY OPERATIONS ---

  public async insertCachedHistory(h: CachedHistoryRow): Promise<void> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = `
        INSERT OR REPLACE INTO cached_study_history (id, card_id, deck_id, rating, reviewed_at, data_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      await this.dbConnection.run(sql, [
        h.id,
        h.card_id,
        h.deck_id,
        h.rating,
        h.reviewed_at,
        h.data_json,
      ]);
    } else {
      this.memHistory.set(h.id, { ...h });
    }
  }

  public async getCachedHistoryByDeck(deckId: string, limit = 100): Promise<CachedHistoryRow[]> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = 'SELECT * FROM cached_study_history WHERE deck_id = ? ORDER BY reviewed_at DESC LIMIT ?';
      const res = await this.dbConnection.query(sql, [deckId, limit]);
      return (res.values as CachedHistoryRow[]) || [];
    } else {
      const list: CachedHistoryRow[] = [];
      for (const h of this.memHistory.values()) {
        if (h.deck_id === deckId) list.push({ ...h });
      }
      list.sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at));
      return list.slice(0, limit);
    }
  }

  // --- CACHED STATS OPERATIONS ---

  public async upsertCachedStats(stats: CachedStatsRow): Promise<void> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = `
        INSERT OR REPLACE INTO cached_stats (deck_id, data_json, updated_at)
        VALUES (?, ?, ?)
      `;
      await this.dbConnection.run(sql, [stats.deck_id, stats.data_json, stats.updated_at]);
    } else {
      this.memStats.set(stats.deck_id, { ...stats });
    }
  }

  public async getCachedStats(deckId: string): Promise<CachedStatsRow | null> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = 'SELECT * FROM cached_stats WHERE deck_id = ? LIMIT 1';
      const res = await this.dbConnection.query(sql, [deckId]);
      return res.values && res.values.length > 0 ? (res.values[0] as CachedStatsRow) : null;
    } else {
      const s = this.memStats.get(deckId);
      return s ? { ...s } : null;
    }
  }
}

export const nativeSQLiteService = new NativeSQLiteService();
