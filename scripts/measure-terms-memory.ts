import Database from 'better-sqlite3';
import path from 'path';
import { AhoCorasick } from '../src/core/ner/ahoCorasick';
import { normalizeText } from '../src/core/ner/DictionaryNEREngine';

const dbPath = path.resolve(process.cwd(), 'src/core/ner/medicalTerminology.db');
console.log(`[Medição] Conectando ao banco SQLite: ${dbPath}...`);

const db = new Database(dbPath, { readonly: true });
const totalRows = (db.prepare('SELECT COUNT(*) as count FROM terms').get() as any).count;
console.log(`[Medição] Total de linhas na tabela terms: ${totalRows}`);

const distinctTerms = (db.prepare('SELECT COUNT(DISTINCT normalized_term) as count FROM terms WHERE normalized_term IS NOT NULL AND length(normalized_term) > 0').get() as any).count;
console.log(`[Medição] Total de termos distintos normalizados: ${distinctTerms}`);

// 1. Medir consumo ao carregar os termos em memória bruta (strings/objetos)
if (global.gc) global.gc();
const baselineHeap = process.memoryUsage().heapUsed;

console.log(`[Medição] Baseline Heap: ${(baselineHeap / 1024 / 1024).toFixed(2)} MB`);

// Consulta todas as linhas com GROUP BY normalized_term para ter metadados únicos
const rows = db.prepare(`
  SELECT normalized_term, canonical_term, category, system, code 
  FROM terms 
  WHERE normalized_term IS NOT NULL AND length(normalized_term) > 0
  GROUP BY normalized_term
`).all() as any[];

const afterQueryHeap = process.memoryUsage().heapUsed;
console.log(`[Medição] Heap após query SQL (${rows.length} termos distintos): ${(afterQueryHeap / 1024 / 1024).toFixed(2)} MB (+${((afterQueryHeap - baselineHeap) / 1024 / 1024).toFixed(2)} MB)`);

// 2. Medir construção do Aho-Corasick JS tradicional (ahoCorasick.ts)
const internMap = new Map<string, string>();
const intern = (s: string | null | undefined): string | null => {
  if (!s) return null;
  let cached = internMap.get(s);
  if (!cached) {
    cached = s;
    internMap.set(s, s);
  }
  return cached;
};

const t0 = Date.now();
const automaton = new AhoCorasick<{
  canonicalTerm: string;
  category: string;
  codeSystem: string | null;
  code: string | null;
}>();

for (const row of rows) {
  automaton.add(row.normalized_term, {
    canonicalTerm: intern(row.canonical_term) || row.normalized_term,
    category: intern(row.category) || 'DOENCA',
    codeSystem: intern(row.system),
    code: intern(row.code),
  });
}

const afterAddHeap = process.memoryUsage().heapUsed;
console.log(`[Medição] Heap após automaton.add() de todos os ${rows.length} termos: ${(afterAddHeap / 1024 / 1024).toFixed(2)} MB (+${((afterAddHeap - baselineHeap) / 1024 / 1024).toFixed(2)} MB)`);

automaton.build();
const tBuild = Date.now() - t0;
const afterBuildHeap = process.memoryUsage().heapUsed;
console.log(`[Medição] Tempo de build do Aho-Corasick JS completo: ${tBuild}ms`);
console.log(`[Medição] Heap final do Aho-Corasick JS completo: ${(afterBuildHeap / 1024 / 1024).toFixed(2)} MB (+${((afterBuildHeap - baselineHeap) / 1024 / 1024).toFixed(2)} MB)`);

db.close();
