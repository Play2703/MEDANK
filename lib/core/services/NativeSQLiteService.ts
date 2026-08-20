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

export interface CachedExtractedExamQuestionRow {
  id: string;
  source_asset_id?: string | null;
  question_number: number;
  statement: string;
  options_json: string;
  correct_letter?: string | null;
  specialty?: string | null;
  confidence: 'high' | 'medium' | 'low';
  created_at: string;
}

export interface GraphNodeRow {
  id: string;
  canonical_code: string;
  code_system: string | null;
  type: string;
  display_text: string | null;
  occurrence_count: number;
}

export interface GraphEdgeRow {
  id: string;
  source_code: string;
  target_code: string;
  predicate: string;
  occurrence_count: number;
  confidence: number;
}

export interface RelatedEntityConnection {
  edgeId: string;
  sourceCode: string;
  targetCode: string;
  predicate: string;
  direction: 'outgoing' | 'incoming';
  relatedCode: string;
  relatedLabel: string;
  relatedType: string;
  relatedSystem: string | null;
  occurrenceCount: number;
  confidence: number;
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
  private memGraphNodes = new Map<string, GraphNodeRow>();
  private memGraphEdges = new Map<string, GraphEdgeRow>();
  private memExtractedQuestions = new Map<string, CachedExtractedExamQuestionRow>();


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
        console.error(
          '[NativeSQLiteService] Erro crítico ao inicializar SQLite nativo (degradando para in-memory store):',
          err
        );
        this.initMemoryStore();
        this.isInitialized = true;
      }
    })();

    return this.initPromise;
  }

  private async createNativeTables(): Promise<void> {
    if (!this.dbConnection) return;

    // 1. Configuração de PRAGMAs com tratamento isolado (WAL pode falhar em certas versões/plataformas iOS sem ser fatal)
    try {
      await this.dbConnection.execute('PRAGMA journal_mode = WAL;');
    } catch (walErr) {
      console.warn('[NativeSQLiteService] Falha ao habilitar PRAGMA journal_mode = WAL (continuando sem WAL):', walErr);
    }

    try {
      await this.dbConnection.execute('PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
    } catch (pragmaErr) {
      console.warn('[NativeSQLiteService] Falha ao aplicar PRAGMAs complementares:', pragmaErr);
    }

    // 2. Criação individual de cada tabela e seus respectivos índices
    const tableSchemas: { name: string; sql: string }[] = [
      {
        name: 'action_queue',
        sql: `
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
        `,
      },
      {
        name: 'cached_flashcards',
        sql: `
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
        `,
      },
      {
        name: 'cached_questions',
        sql: `
          CREATE TABLE IF NOT EXISTS cached_questions (
            id TEXT PRIMARY KEY,
            set_id TEXT,
            category TEXT,
            difficulty TEXT,
            data_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_cached_questions_set ON cached_questions(set_id);
        `,
      },
      {
        name: 'cached_study_history',
        sql: `
          CREATE TABLE IF NOT EXISTS cached_study_history (
            id TEXT PRIMARY KEY,
            card_id TEXT NOT NULL,
            deck_id TEXT NOT NULL,
            rating TEXT NOT NULL,
            reviewed_at TEXT NOT NULL,
            data_json TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_cached_hist_deck ON cached_study_history(deck_id, reviewed_at);
        `,
      },
      {
        name: 'cached_stats',
        sql: `
          CREATE TABLE IF NOT EXISTS cached_stats (
            deck_id TEXT PRIMARY KEY,
            data_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `,
      },
      {
        name: 'graph_nodes',
        sql: `
          CREATE TABLE IF NOT EXISTS graph_nodes (
            id TEXT PRIMARY KEY,
            canonical_code TEXT NOT NULL,
            code_system TEXT,
            type TEXT NOT NULL,
            display_text TEXT,
            occurrence_count INTEGER DEFAULT 1
          );
          CREATE INDEX IF NOT EXISTS idx_graph_nodes_canonical ON graph_nodes(canonical_code);
        `,
      },
      {
        name: 'graph_edges',
        sql: `
          CREATE TABLE IF NOT EXISTS graph_edges (
            id TEXT PRIMARY KEY,
            source_code TEXT NOT NULL,
            target_code TEXT NOT NULL,
            predicate TEXT NOT NULL,
            occurrence_count INTEGER DEFAULT 1,
            confidence REAL DEFAULT 1.0
          );
          CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_code);
          CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_code);
          CREATE INDEX IF NOT EXISTS idx_graph_edges_predicate ON graph_edges(predicate);
        `,
      },
      {
        name: 'cached_extracted_exam_questions',
        sql: `
          CREATE TABLE IF NOT EXISTS cached_extracted_exam_questions (
            id TEXT PRIMARY KEY,
            source_asset_id TEXT,
            question_number INTEGER NOT NULL,
            statement TEXT NOT NULL,
            options_json TEXT NOT NULL,
            correct_letter TEXT,
            specialty TEXT,
            confidence TEXT NOT NULL,
            created_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_cached_ext_q_asset ON cached_extracted_exam_questions(source_asset_id);
          CREATE INDEX IF NOT EXISTS idx_cached_ext_q_num ON cached_extracted_exam_questions(question_number);
        `,
      },
    ];

    for (const table of tableSchemas) {
      try {
        await this.dbConnection.execute(table.sql);
      } catch (tableErr) {
        console.error(`[NativeSQLiteService] Falha ao criar tabela nativa '${table.name}':`, tableErr);
      }
    }

    // 3. Verificação de integridade pós-criação das tabelas
    try {
      const res = await this.dbConnection.query("SELECT name FROM sqlite_master WHERE type='table';");
      const existingTables = new Set(((res.values as { name: string }[]) || []).map((r) => r.name));
      const expectedTables = [
        'action_queue',
        'cached_flashcards',
        'cached_questions',
        'cached_study_history',
        'cached_stats',
        'graph_nodes',
        'graph_edges',
        'cached_extracted_exam_questions',
      ];
      const missingTables = expectedTables.filter((t) => !existingTables.has(t));
      if (missingTables.length > 0) {
        console.error(
          '[NativeSQLiteService] ALERTA CRÍTICO: Tabelas nativas ausentes pós-criação:',
          missingTables
        );
      } else {
        console.log('[NativeSQLiteService] Todas as 8 tabelas nativas verificadas com sucesso.');
      }
    } catch (verifErr) {
      console.error('[NativeSQLiteService] Erro ao verificar integridade das tabelas nativas:', verifErr);
    }
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

  public async getAllCachedQuestions(): Promise<CachedQuestionRow[]> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = 'SELECT * FROM cached_questions';
      const res = await this.dbConnection.query(sql);
      return (res.values as CachedQuestionRow[]) || [];
    } else {
      return Array.from(this.memQuestions.values()).map((q) => ({ ...q }));
    }
  }

  public async getCachedQuestionsByCategory(category: string): Promise<CachedQuestionRow[]> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = 'SELECT * FROM cached_questions WHERE category LIKE ?';
      const res = await this.dbConnection.query(sql, [`%${category}%`]);
      return (res.values as CachedQuestionRow[]) || [];
    } else {
      const catNorm = category.toLowerCase();
      return Array.from(this.memQuestions.values())
        .filter((q) => (q.category || '').toLowerCase().includes(catNorm))
        .map((q) => ({ ...q }));
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

  // --- KNOWLEDGE GRAPH RELATIONAL OPERATIONS ---

  public async upsertGraphNode(node: GraphNodeRow): Promise<void> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = `
        INSERT OR REPLACE INTO graph_nodes (id, canonical_code, code_system, type, display_text, occurrence_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      await this.dbConnection.run(sql, [
        node.id,
        node.canonical_code,
        node.code_system,
        node.type,
        node.display_text,
        node.occurrence_count,
      ]);
    } else {
      this.memGraphNodes.set(node.canonical_code, { ...node });
    }
  }

  public async upsertGraphEdge(edge: GraphEdgeRow): Promise<void> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = `
        INSERT OR REPLACE INTO graph_edges (id, source_code, target_code, predicate, occurrence_count, confidence)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      await this.dbConnection.run(sql, [
        edge.id,
        edge.source_code,
        edge.target_code,
        edge.predicate,
        edge.occurrence_count,
        edge.confidence,
      ]);
    } else {
      this.memGraphEdges.set(edge.id, { ...edge });
    }
  }

  /**
   * High-performance relational SQL query for knowledge graph connections
   */
  public async getRelatedEntities(
    canonicalCode: string,
    filterPredicate?: string
  ): Promise<RelatedEntityConnection[]> {
    await this.initialize();
    if (!canonicalCode) return [];

    const normCode = canonicalCode.toLowerCase().trim();

    if (this.dbConnection && this.isNative()) {
      const results: RelatedEntityConnection[] = [];

      // 1. Outgoing
      let outSql = `
        SELECT e.id as edgeId, e.source_code as sourceCode, e.target_code as targetCode,
               e.predicate, e.occurrence_count as occurrenceCount, e.confidence,
               'outgoing' as direction, e.target_code as relatedCode,
               COALESCE(n.display_text, e.target_code) as relatedLabel,
               COALESCE(n.type, 'entity') as relatedType,
               n.code_system as relatedSystem
        FROM graph_edges e
        LEFT JOIN graph_nodes n ON n.canonical_code = e.target_code
        WHERE e.source_code = ? OR e.source_code = ?
      `;
      const outParams: any[] = [canonicalCode, normCode];
      if (filterPredicate) {
        outSql += ' AND e.predicate = ?';
        outParams.push(filterPredicate);
      }
      const outRes = await this.dbConnection.query(outSql, outParams);
      if (outRes.values) results.push(...(outRes.values as RelatedEntityConnection[]));

      // 2. Incoming
      let inSql = `
        SELECT e.id as edgeId, e.source_code as sourceCode, e.target_code as targetCode,
               e.predicate, e.occurrence_count as occurrenceCount, e.confidence,
               'incoming' as direction, e.source_code as relatedCode,
               COALESCE(n.display_text, e.source_code) as relatedLabel,
               COALESCE(n.type, 'entity') as relatedType,
               n.code_system as relatedSystem
        FROM graph_edges e
        LEFT JOIN graph_nodes n ON n.canonical_code = e.source_code
        WHERE e.target_code = ? OR e.target_code = ?
      `;
      const inParams: any[] = [canonicalCode, normCode];
      if (filterPredicate) {
        inSql += ' AND e.predicate = ?';
        inParams.push(filterPredicate);
      }
      const inRes = await this.dbConnection.query(inSql, inParams);
      if (inRes.values) results.push(...(inRes.values as RelatedEntityConnection[]));

      return results;
    } else {
      const results: RelatedEntityConnection[] = [];

      for (const edge of this.memGraphEdges.values()) {
        if (edge.source_code === canonicalCode || edge.source_code === normCode) {
          if (!filterPredicate || edge.predicate === filterPredicate) {
            const targetNode = this.memGraphNodes.get(edge.target_code);
            results.push({
              edgeId: edge.id,
              sourceCode: edge.source_code,
              targetCode: edge.target_code,
              predicate: edge.predicate,
              direction: 'outgoing',
              relatedCode: edge.target_code,
              relatedLabel: targetNode?.display_text || edge.target_code,
              relatedType: targetNode?.type || 'entity',
              relatedSystem: targetNode?.code_system || null,
              occurrenceCount: edge.occurrence_count,
              confidence: edge.confidence,
            });
          }
        }

        if (edge.target_code === canonicalCode || edge.target_code === normCode) {
          if (!filterPredicate || edge.predicate === filterPredicate) {
            const sourceNode = this.memGraphNodes.get(edge.source_code);
            results.push({
              edgeId: edge.id,
              sourceCode: edge.source_code,
              targetCode: edge.target_code,
              predicate: edge.predicate,
              direction: 'incoming',
              relatedCode: edge.source_code,
              relatedLabel: sourceNode?.display_text || edge.source_code,
              relatedType: sourceNode?.type || 'entity',
              relatedSystem: sourceNode?.code_system || null,
              occurrenceCount: edge.occurrence_count,
              confidence: edge.confidence,
            });
          }
        }
      }

      return results;
    }
  }

  public async getGraphNodeByCode(canonicalCode: string): Promise<GraphNodeRow | null> {
    await this.initialize();
    if (!canonicalCode) return null;
    const normCode = canonicalCode.toLowerCase().trim();

    if (this.dbConnection && this.isNative()) {
      const sql = 'SELECT * FROM graph_nodes WHERE canonical_code = ? OR canonical_code = ? LIMIT 1';
      const res = await this.dbConnection.query(sql, [canonicalCode, normCode]);
      return res.values && res.values.length > 0 ? (res.values[0] as GraphNodeRow) : null;
    } else {
      const node = this.memGraphNodes.get(canonicalCode) || this.memGraphNodes.get(normCode);
      return node ? { ...node } : null;
    }
  }

  // --- EXTRACTED EXAM QUESTIONS OPERATIONS ---

  public async insertExtractedExamQuestion(row: CachedExtractedExamQuestionRow): Promise<void> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = `
        INSERT OR REPLACE INTO cached_extracted_exam_questions (
          id, source_asset_id, question_number, statement, options_json, correct_letter, specialty, confidence, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await this.dbConnection.run(sql, [
        row.id,
        row.source_asset_id || null,
        row.question_number,
        row.statement,
        row.options_json,
        row.correct_letter || null,
        row.specialty || null,
        row.confidence,
        row.created_at,
      ]);
    } else {
      this.memExtractedQuestions.set(row.id, { ...row });
    }
  }

  public async bulkInsertExtractedExamQuestions(rows: CachedExtractedExamQuestionRow[]): Promise<void> {
    await this.initialize();
    if (rows.length === 0) return;

    if (this.dbConnection && this.isNative()) {
      const sql = `
        INSERT OR REPLACE INTO cached_extracted_exam_questions (
          id, source_asset_id, question_number, statement, options_json, correct_letter, specialty, confidence, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      for (const row of rows) {
        await this.dbConnection.run(sql, [
          row.id,
          row.source_asset_id || null,
          row.question_number,
          row.statement,
          row.options_json,
          row.correct_letter || null,
          row.specialty || null,
          row.confidence,
          row.created_at,
        ]);
      }
    } else {
      for (const row of rows) {
        this.memExtractedQuestions.set(row.id, { ...row });
      }
    }
  }

  public async getExtractedExamQuestionsByAssetId(assetId: string): Promise<CachedExtractedExamQuestionRow[]> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = 'SELECT * FROM cached_extracted_exam_questions WHERE source_asset_id = ? ORDER BY question_number ASC';
      const res = await this.dbConnection.query(sql, [assetId]);
      return (res.values as CachedExtractedExamQuestionRow[]) || [];
    } else {
      const results: CachedExtractedExamQuestionRow[] = [];
      for (const row of this.memExtractedQuestions.values()) {
        if (row.source_asset_id === assetId) {
          results.push({ ...row });
        }
      }
      return results.sort((a, b) => a.question_number - b.question_number);
    }
  }

  public async getAllExtractedExamQuestions(): Promise<CachedExtractedExamQuestionRow[]> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = 'SELECT * FROM cached_extracted_exam_questions ORDER BY created_at DESC, question_number ASC';
      const res = await this.dbConnection.query(sql);
      return (res.values as CachedExtractedExamQuestionRow[]) || [];
    } else {
      return Array.from(this.memExtractedQuestions.values()).sort(
        (a, b) => a.created_at.localeCompare(b.created_at) || a.question_number - b.question_number
      );
    }
  }

  public async getExtractedExamQuestionById(id: string): Promise<CachedExtractedExamQuestionRow | null> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = 'SELECT * FROM cached_extracted_exam_questions WHERE id = ? LIMIT 1';
      const res = await this.dbConnection.query(sql, [id]);
      return res.values && res.values.length > 0 ? (res.values[0] as CachedExtractedExamQuestionRow) : null;
    } else {
      const row = this.memExtractedQuestions.get(id);
      return row ? { ...row } : null;
    }
  }

  public async deleteExtractedExamQuestionsByAssetId(assetId: string): Promise<void> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = 'DELETE FROM cached_extracted_exam_questions WHERE source_asset_id = ?';
      await this.dbConnection.run(sql, [assetId]);
    } else {
      for (const [id, row] of this.memExtractedQuestions.entries()) {
        if (row.source_asset_id === assetId) {
          this.memExtractedQuestions.delete(id);
        }
      }
    }
  }

  public async deleteExtractedExamQuestion(id: string): Promise<void> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = 'DELETE FROM cached_extracted_exam_questions WHERE id = ?';
      await this.dbConnection.run(sql, [id]);
    } else {
      this.memExtractedQuestions.delete(id);
    }
  }

  public async clearExtractedExamQuestions(): Promise<void> {
    await this.initialize();
    if (this.dbConnection && this.isNative()) {
      const sql = 'DELETE FROM cached_extracted_exam_questions';
      await this.dbConnection.run(sql);
    } else {
      this.memExtractedQuestions.clear();
    }
  }
}

export const nativeSQLiteService = new NativeSQLiteService();

