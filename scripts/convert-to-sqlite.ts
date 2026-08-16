/**
 * Conversion Script: medicalTerminologyPt.json & Knowledge Graph JSONs -> medicalTerminology.db (SQLite)
 *
 * Migrates static JSON medical dictionary and knowledge graph into high-performance, indexed SQLite database.
 * Run with: npm run db:build
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveCodesForEntry(entry: any): { codeSystem: string | null; code: string | null } {
  if (Array.isArray(entry.codes) && entry.codes.length > 0) {
    const cid = entry.codes.find((c: any) => c.system === 'CID-10');
    if (cid) return { codeSystem: 'CID-10', code: cid.code };
    const decs = entry.codes.find((c: any) => c.system === 'DeCS');
    if (decs) return { codeSystem: 'DeCS', code: decs.code };
    const mesh = entry.codes.find((c: any) => c.system === 'MeSH');
    if (mesh) return { codeSystem: 'MeSH', code: mesh.code };
    const first = entry.codes[0];
    if (first) return { codeSystem: first.system || null, code: first.code || null };
  }

  const cidRegex = /^[A-Z][0-9]{2}(\.[0-9]{1,2})?$/;
  for (const syn of entry.synonyms || []) {
    if (typeof syn === 'string' && cidRegex.test(syn.trim())) {
      return { codeSystem: 'CID-10', code: syn.trim() };
    }
  }

  return { codeSystem: null, code: null };
}

interface TermRecord {
  term: string;
  normalized_term: string;
  system: string | null;
  code: string | null;
  category: string;
  canonical_term: string;
  metadata?: string | null;
}

export function ensureMetadataColumn(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(terms)").all() as Array<{ name: string }>;
  const hasMetadata = columns.some((col) => col.name === 'metadata');
  if (!hasMetadata) {
    console.log('⚡ Adicionando coluna metadata à tabela terms (migração retrocompatível)...');
    db.exec('ALTER TABLE terms ADD COLUMN metadata TEXT;');
  }
}

interface GraphNodeRecord {
  id: string;
  canonical_code: string;
  code_system: string | null;
  type: string;
  display_text: string;
  occurrence_count: number;
}

interface GraphEdgeRecord {
  id: string;
  source_code: string;
  target_code: string;
  predicate: string;
  occurrence_count: number;
  confidence: number;
}

export function convertJsonToSqlite(
  jsonFilePath?: string,
  targetDbPath?: string
): { totalEntries: number; totalRows: number; totalNodes: number; totalEdges: number; dbPath: string } {
  const jsonPath = jsonFilePath || path.resolve(process.cwd(), 'src/core/ner/medicalTerminologyPt.json');
  const dbPath = targetDbPath || path.resolve(process.cwd(), 'src/core/ner/medicalTerminology.db');
  const rootDbPath = path.resolve(process.cwd(), 'medicalTerminology.db');

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Arquivo JSON não encontrado em: ${jsonPath}`);
  }

  console.log(`📖 Lendo ${jsonPath}...`);
  const rawData: any[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`✅ ${rawData.length} termos principais carregados do JSON.`);

  // Remove existing DB file to rebuild cleanly
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const db = new Database(dbPath);

  // Performance pragmas for bulk load
  db.pragma('journal_mode = OFF');
  db.pragma('synchronous = OFF');

  // Create tables and indexes
  db.exec(`
    CREATE TABLE terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT NOT NULL,
      normalized_term TEXT NOT NULL,
      system TEXT,
      code TEXT,
      category TEXT,
      canonical_term TEXT,
      metadata TEXT
    );
    CREATE INDEX idx_term ON terms(term);
    CREATE INDEX idx_terms_normalized_term ON terms(normalized_term);

    CREATE TABLE graph_nodes (
      id TEXT PRIMARY KEY,
      canonical_code TEXT NOT NULL,
      code_system TEXT,
      type TEXT NOT NULL,
      display_text TEXT,
      occurrence_count INTEGER DEFAULT 1
    );
    CREATE INDEX idx_graph_nodes_canonical ON graph_nodes(canonical_code);

    CREATE TABLE graph_edges (
      id TEXT PRIMARY KEY,
      source_code TEXT NOT NULL,
      target_code TEXT NOT NULL,
      predicate TEXT NOT NULL,
      occurrence_count INTEGER DEFAULT 1,
      confidence REAL DEFAULT 1.0
    );
    CREATE INDEX idx_graph_edges_source ON graph_edges(source_code);
    CREATE INDEX idx_graph_edges_target ON graph_edges(target_code);
    CREATE INDEX idx_graph_edges_predicate ON graph_edges(predicate);
  `);

  const insertTermStmt = db.prepare(`
    INSERT INTO terms (term, normalized_term, system, code, category, canonical_term, metadata)
    VALUES (@term, @normalized_term, @system, @code, @category, @canonical_term, @metadata)
  `);

  console.log('⚡ Mapeando e deduplicando termos...');
  const cidRegex = /^[A-Z][0-9]{2}(\.[0-9]{1,2})?$/;
  const termsMap = new Map<string, TermRecord>();

  const registerTerm = (termKey: string, record: TermRecord) => {
    if (!termKey) return;
    const existing = termsMap.get(termKey);
    if (!existing) {
      termsMap.set(termKey, record);
    } else {
      if (!existing.code && record.code) {
        existing.system = record.system;
        existing.code = record.code;
      }
    }
  };

  for (const entry of rawData) {
    const { codeSystem, code } = resolveCodesForEntry(entry);
    const category = entry.category || 'DOENCA';
    const canonicalTerm = entry.term;

    const trimmedCanon = canonicalTerm.trim();
    const normCanon = normalizeText(trimmedCanon);

    const baseRecord: TermRecord = {
      term: trimmedCanon,
      normalized_term: normCanon,
      system: codeSystem,
      code,
      category,
      canonical_term: canonicalTerm,
    };

    // 1. Canonical term
    registerTerm(normCanon, { ...baseRecord, term: normCanon, normalized_term: normCanon });
    if (trimmedCanon !== normCanon) {
      registerTerm(trimmedCanon, { ...baseRecord, term: trimmedCanon, normalized_term: normCanon });
    }

    // 2. Synonyms
    for (const syn of entry.synonyms || []) {
      if (typeof syn === 'string' && syn.trim()) {
        const trimmedSyn = syn.trim();
        const normSyn = normalizeText(trimmedSyn);
        let sys = codeSystem;
        let c = code;

        if (cidRegex.test(trimmedSyn)) {
          sys = 'CID-10';
          c = trimmedSyn;
        }

        const synRecord: TermRecord = {
          term: normSyn,
          normalized_term: normSyn,
          system: sys,
          code: c,
          category,
          canonical_term: canonicalTerm,
        };

        registerTerm(normSyn, synRecord);
        if (trimmedSyn !== normSyn) {
          registerTerm(trimmedSyn, { ...synRecord, term: trimmedSyn, normalized_term: normSyn });
        }
      }
    }
  }

  console.log(`⚡ Inserindo ${termsMap.size} termos únicos no SQLite com transação...`);
  console.time('Tempo de Inserção de Termos');

  const insertTermsTx = db.transaction((records: TermRecord[]) => {
    for (const rec of records) {
      insertTermStmt.run({
        term: rec.term,
        normalized_term: rec.normalized_term,
        system: rec.system,
        code: rec.code,
        category: rec.category,
        canonical_term: rec.canonical_term,
        metadata: rec.metadata || null,
      });
    }
  });

  insertTermsTx(Array.from(termsMap.values()));
  console.timeEnd('Tempo de Inserção de Termos');

  // --- KNOWLEDGE GRAPH SEED MIGRATION ---
  console.log('⚡ Migrando Knowledge Graph (nodes & edges) para SQLite...');
  const nodesMap = new Map<string, GraphNodeRecord>();
  const edgesMap = new Map<string, GraphEdgeRecord>();

  // 1. Check for canonical-entity-index.json
  const canonicalPaths = [
    path.resolve(process.cwd(), 'public/seed-data/canonical-entity-index.json'),
    path.resolve(process.cwd(), 'scripts/seed-source/canonical-entity-index.json'),
  ];
  for (const cPath of canonicalPaths) {
    if (fs.existsSync(cPath)) {
      try {
        const canonicalList: any[] = JSON.parse(fs.readFileSync(cPath, 'utf-8'));
        for (const item of canonicalList) {
          const key = item.canonicalKey || item.canonical_code;
          if (!key) continue;
          nodesMap.set(key, {
            id: key,
            canonical_code: key,
            code_system: item.code_system || item.codeSystem || null,
            type: item.type || 'entity',
            display_text: item.displayText || item.display_text || item.canonicalKey || key,
            occurrence_count: item.occurrenceCount || 1,
          });
        }
        console.log(`  -> Carregados ${canonicalList.length} nós de ${cPath}`);
        break;
      } catch (err) {
        console.warn(`  ⚠️ Erro ao ler nós de ${cPath}:`, err);
      }
    }
  }

  // 2. Check for graph-edges.json
  const graphEdgePaths = [
    path.resolve(process.cwd(), 'public/seed-data/graph-edges.json'),
    path.resolve(process.cwd(), 'scripts/seed-source/graph-edges.json'),
  ];
  for (const ePath of graphEdgePaths) {
    if (fs.existsSync(ePath)) {
      try {
        const edgeList: any[] = JSON.parse(fs.readFileSync(ePath, 'utf-8'));
        for (const edge of edgeList) {
          const source = edge.subjectCanonicalKey || edge.source_code;
          const target = edge.objectCanonicalKey || edge.target_code;
          const predicate = edge.predicate;
          if (!source || !target || !predicate) continue;

          const edgeId = edge.id || `${source}::${predicate}::${target}`;
          edgesMap.set(edgeId, {
            id: edgeId,
            source_code: source,
            target_code: target,
            predicate,
            occurrence_count: edge.occurrenceCount || 1,
            confidence: edge.maxConfidence || edge.confidence || 1.0,
          });

          // Ensure node existence
          if (!nodesMap.has(source)) {
            nodesMap.set(source, {
              id: source,
              canonical_code: source,
              code_system: null,
              type: 'entity',
              display_text: source,
              occurrence_count: 1,
            });
          }
          if (!nodesMap.has(target)) {
            nodesMap.set(target, {
              id: target,
              canonical_code: target,
              code_system: null,
              type: 'entity',
              display_text: target,
              occurrence_count: 1,
            });
          }
        }
        console.log(`  -> Carregadas ${edgeList.length} arestas de ${ePath}`);
        break;
      } catch (err) {
        console.warn(`  ⚠️ Erro ao ler arestas de ${ePath}:`, err);
      }
    }
  }

  // Insert Graph Nodes
  const insertNodeStmt = db.prepare(`
    INSERT OR REPLACE INTO graph_nodes (id, canonical_code, code_system, type, display_text, occurrence_count)
    VALUES (@id, @canonical_code, @code_system, @type, @display_text, @occurrence_count)
  `);
  const insertNodesTx = db.transaction((nodes: GraphNodeRecord[]) => {
    for (const node of nodes) {
      insertNodeStmt.run(node);
    }
  });
  insertNodesTx(Array.from(nodesMap.values()));

  // Insert Graph Edges
  const insertEdgeStmt = db.prepare(`
    INSERT OR REPLACE INTO graph_edges (id, source_code, target_code, predicate, occurrence_count, confidence)
    VALUES (@id, @source_code, @target_code, @predicate, @occurrence_count, @confidence)
  `);
  const insertEdgesTx = db.transaction((edges: GraphEdgeRecord[]) => {
    for (const edge of edges) {
      insertEdgeStmt.run(edge);
    }
  });
  insertEdgesTx(Array.from(edgesMap.values()));

  // Switch back to normal journaling and optimize
  db.pragma('journal_mode = DELETE');
  db.pragma('optimize');

  const countRow = db.prepare('SELECT COUNT(*) as count FROM terms').get() as { count: number };
  const totalRows = countRow.count;

  const nodeCountRow = db.prepare('SELECT COUNT(*) as count FROM graph_nodes').get() as { count: number };
  const edgeCountRow = db.prepare('SELECT COUNT(*) as count FROM graph_edges').get() as { count: number };

  db.close();

  // Also copy to root medicalTerminology.db for root-level access if needed
  fs.copyFileSync(dbPath, rootDbPath);

  const stat = fs.statSync(dbPath);
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);

  console.log(`\n==================================================`);
  console.log(`🎉 BANCO SQLITE CRIADO COM SUCESSO!`);
  console.log(`==================================================`);
  console.log(`- Localização:            ${dbPath}`);
  console.log(`- Cópia Raiz:             ${rootDbPath}`);
  console.log(`- Termos principais JSON: ${rawData.length}`);
  console.log(`- Total de linhas termos: ${totalRows}`);
  console.log(`- Total nós do Grafo:     ${nodeCountRow.count}`);
  console.log(`- Total arestas do Grafo: ${edgeCountRow.count}`);
  console.log(`- Tamanho em disco:       ${sizeMb} MB`);
  console.log(`==================================================\n`);

  return {
    totalEntries: rawData.length,
    totalRows,
    totalNodes: nodeCountRow.count,
    totalEdges: edgeCountRow.count,
    dbPath,
  };
}

if (process.argv[1] && process.argv[1].endsWith('convert-to-sqlite.ts')) {
  convertJsonToSqlite();
}
