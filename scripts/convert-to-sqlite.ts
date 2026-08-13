/**
 * Conversion Script: medicalTerminologyPt.json -> medicalTerminology.db (SQLite)
 *
 * Migrates static JSON medical dictionary into a high-performance, indexed SQLite database.
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
  system: string | null;
  code: string | null;
  category: string;
  canonical_term: string;
}

export function convertJsonToSqlite(
  jsonFilePath?: string,
  targetDbPath?: string
): { totalEntries: number; totalRows: number; dbPath: string } {
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

  // Create table and index
  db.exec(`
    CREATE TABLE terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT NOT NULL,
      system TEXT,
      code TEXT,
      category TEXT,
      canonical_term TEXT
    );
    CREATE INDEX idx_term ON terms(term);
  `);

  const insertStmt = db.prepare(`
    INSERT INTO terms (term, system, code, category, canonical_term)
    VALUES (@term, @system, @code, @category, @canonical_term)
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
      // Enrich existing record with codes if missing
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

    const baseRecord: TermRecord = {
      term: canonicalTerm,
      system: codeSystem,
      code,
      category,
      canonical_term: canonicalTerm,
    };

    // 1. Canonical term
    const trimmedCanon = canonicalTerm.trim();
    const normCanon = normalizeText(trimmedCanon);
    registerTerm(normCanon, { ...baseRecord, term: normCanon });
    if (trimmedCanon !== normCanon) {
      registerTerm(trimmedCanon, { ...baseRecord, term: trimmedCanon });
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
          system: sys,
          code: c,
          category,
          canonical_term: canonicalTerm,
        };

        registerTerm(normSyn, synRecord);
        if (trimmedSyn !== normSyn) {
          registerTerm(trimmedSyn, { ...synRecord, term: trimmedSyn });
        }
      }
    }
  }

  console.log(`⚡ Inserindo ${termsMap.size} termos únicos no SQLite com transação...`);
  console.time('Tempo de Inserção');

  const insertTransaction = db.transaction((records: TermRecord[]) => {
    for (const rec of records) {
      insertStmt.run({
        term: rec.term,
        system: rec.system,
        code: rec.code,
        category: rec.category,
        canonical_term: rec.canonical_term,
      });
    }
  });

  insertTransaction(Array.from(termsMap.values()));
  console.timeEnd('Tempo de Inserção');

  // Switch back to normal journaling and optimize
  db.pragma('journal_mode = DELETE');
  db.pragma('optimize');

  const countRow = db.prepare('SELECT COUNT(*) as count FROM terms').get() as { count: number };
  const totalRows = countRow.count;

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
  console.log(`- Total de linhas no DB:  ${totalRows}`);
  console.log(`- Tamanho em disco:       ${sizeMb} MB`);
  console.log(`==================================================\n`);

  return {
    totalEntries: rawData.length,
    totalRows,
    dbPath,
  };
}

if (process.argv[1] && process.argv[1].endsWith('convert-to-sqlite.ts')) {
  convertJsonToSqlite();
}
