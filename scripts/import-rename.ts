/**
 * RENAME (Relação Nacional de Medicamentos Essenciais - Ministério da Saúde) Import Script for MedAnki
 *
 * Imports/enriches clinical drug terminology in medicalTerminology.db with essential medicine metadata.
 * Run with: npx tsx scripts/import-rename.ts [caminho_arquivo.csv]
 * npm script: npm run dict:import-rename
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { normalizeText, ensureMetadataColumn } from './convert-to-sqlite';
import { getDbPath } from '../src/core/ner/DictionaryNEREngine';

export interface RenameImportRow {
  medicamento: string;
  componente?: string;
  formaFarmaceutica?: string;
  codigo?: string;
}

export function parseCsvLines(csvContent: string): Array<Record<string, string>> {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Detect separator: comma or semicolon or tab
  const firstLine = lines[0];
  let separator = ',';
  if (firstLine.includes(';') && !firstLine.includes(',')) {
    separator = ';';
  } else if (firstLine.split(';').length > firstLine.split(',').length) {
    separator = ';';
  } else if (firstLine.includes('\t')) {
    separator = '\t';
  }

  // Parse CSV line handling quotes
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === separator && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const rawHeaders = parseLine(lines[0]);
  const headers = rawHeaders.map((h) =>
    h
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
  );

  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length === 0 || (values.length === 1 && !values[0])) continue;

    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] || '';
    });
    rows.push(rowObj);
  }

  return rows;
}

export function extractRenameFields(row: Record<string, string>): RenameImportRow | null {
  // Find medicamento / nome column
  const medKey = Object.keys(row).find((k) =>
    ['medicamento', 'nome', 'principio_ativo', 'denominacao', 'farmaco', 'item', 'descricao', 'nome_do_medicamento'].includes(k)
  ) || Object.keys(row)[0];

  const medName = row[medKey]?.trim();
  if (!medName) return null;

  // Find componente column
  const compKey = Object.keys(row).find((k) =>
    ['componente', 'grupo', 'tipo_componente', 'nivel', 'tipo'].includes(k)
  );
  const componente = compKey ? row[compKey]?.trim() : undefined;

  // Find forma farmacêutica column
  const formaKey = Object.keys(row).find((k) =>
    ['forma_farmaceutica', 'forma', 'apresentacao', 'concentracao', 'especificacao'].includes(k)
  );
  const formaFarmaceutica = formaKey ? row[formaKey]?.trim() : undefined;

  // Find codigo column
  const codeKey = Object.keys(row).find((k) =>
    ['codigo', 'catmat', 'codigo_rename', 'cod_rename', 'cod'].includes(k)
  );
  const codigo = codeKey ? row[codeKey]?.trim() : undefined;

  return {
    medicamento: medName,
    componente,
    formaFarmaceutica,
    codigo,
  };
}

export function resolveRenameSourcePath(customPath?: string): string {
  if (customPath && fs.existsSync(customPath)) {
    return path.resolve(customPath);
  }

  const candidatePaths = [
    path.resolve(process.cwd(), 'scripts/seed-source/rename/rename.csv'),
    path.resolve(process.cwd(), 'scripts/seed-source/rename.csv'),
    path.resolve(process.cwd(), 'scripts/seed-source/rename/RENAME.csv'),
    path.resolve(process.cwd(), 'scripts/seed-source/rename/fixtures/sample-rename.csv'),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }

  throw new Error(
    `Nenhum arquivo CSV da RENAME encontrado. Coloque o arquivo em scripts/seed-source/rename/rename.csv ou passe o caminho como argumento: npm run dict:import-rename -- /caminho/arquivo.csv`
  );
}

export function importRename(csvPathArg?: string): {
  totalProcessed: number;
  totalEnriched: number;
  totalInserted: number;
  dbPath: string;
} {
  const sourcePath = resolveRenameSourcePath(csvPathArg);
  const dbPath = getDbPath();
  const rootDbPath = path.resolve(process.cwd(), 'medicalTerminology.db');

  console.log(`\n==================================================`);
  console.log(`🚀 INICIANDO IMPORTAÇÃO RENAME (Medicamentos Essenciais)`);
  console.log(`==================================================`);
  console.log(`- Arquivo fonte: ${sourcePath}`);
  console.log(`- Banco SQLite:  ${dbPath}`);

  const csvContent = fs.readFileSync(sourcePath, 'utf-8');
  const rawRows = parseCsvLines(csvContent);
  console.log(`- Linhas brutas lidas no CSV: ${rawRows.length}`);

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Banco SQLite não encontrado em ${dbPath}. Execute primeiro: npm run db:build`);
  }

  const db = new Database(dbPath);
  ensureMetadataColumn(db);

  // Performance pragmas for import
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Prepared queries
  const selectTermStmt = db.prepare<[string], { id: number; system: string | null; code: string | null; category: string | null; canonical_term: string | null; metadata: string | null }>(
    'SELECT id, system, code, category, canonical_term, metadata FROM terms WHERE normalized_term = ? LIMIT 1'
  );

  const updateTermStmt = db.prepare(
    "UPDATE terms SET metadata = ?, category = COALESCE(category, 'MEDICAMENTO') WHERE id = ?"
  );

  const insertTermStmt = db.prepare(
    'INSERT INTO terms (term, normalized_term, system, code, category, canonical_term, metadata) VALUES (@term, @normalized_term, @system, @code, @category, @canonical_term, @metadata)'
  );

  let totalProcessed = 0;
  let totalEnriched = 0;
  let totalInserted = 0;

  const importTx = db.transaction((rows: Array<Record<string, string>>) => {
    for (const r of rows) {
      const item = extractRenameFields(r);
      if (!item || !item.medicamento) continue;

      totalProcessed++;
      const canonical = item.medicamento.trim();
      const normalized = normalizeText(canonical);
      if (!normalized) continue;

      const renameMeta: Record<string, any> = {
        essential: true,
        source: 'RENAME',
        ...(item.componente ? { componente: item.componente } : {}),
        ...(item.formaFarmaceutica ? { formaFarmaceutica: item.formaFarmaceutica } : {}),
        ...(item.codigo ? { renameCode: item.codigo } : {}),
      };

      const existing = selectTermStmt.get(normalized);

      if (existing) {
        // Merge metadata preserving previous keys
        let existingMeta: Record<string, any> = {};
        if (existing.metadata) {
          try {
            existingMeta = JSON.parse(existing.metadata);
          } catch {
            existingMeta = {};
          }
        }

        const mergedMeta = {
          ...existingMeta,
          ...renameMeta,
          essential: true,
        };

        updateTermStmt.run(JSON.stringify(mergedMeta), existing.id);
        totalEnriched++;
      } else {
        // Insert new RENAME term
        const metaStr = JSON.stringify(renameMeta);
        insertTermStmt.run({
          term: normalized,
          normalized_term: normalized,
          system: 'RENAME',
          code: item.codigo || null,
          category: 'MEDICAMENTO',
          canonical_term: canonical,
          metadata: metaStr,
        });

        if (canonical !== normalized) {
          insertTermStmt.run({
            term: canonical,
            normalized_term: normalized,
            system: 'RENAME',
            code: item.codigo || null,
            category: 'MEDICAMENTO',
            canonical_term: canonical,
            metadata: metaStr,
          });
        }
        totalInserted++;
      }
    }
  });

  console.time('Tempo de processamento RENAME');
  importTx(rawRows);
  console.timeEnd('Tempo de processamento RENAME');

  db.pragma('optimize');
  db.close();

  // Sync to root medicalTerminology.db
  if (fs.existsSync(rootDbPath) && rootDbPath !== dbPath) {
    fs.copyFileSync(dbPath, rootDbPath);
  }

  console.log(`\n==================================================`);
  console.log(`✅ IMPORTAÇÃO RENAME CONCLUÍDA COM SUCESSO!`);
  console.log(`==================================================`);
  console.log(`- Total de registros processados: ${totalProcessed}`);
  console.log(`- Termos enriquecidos (DeCS/Existentes): ${totalEnriched}`);
  console.log(`- Novos termos RENAME inseridos:        ${totalInserted}`);
  console.log(`==================================================\n`);

  return {
    totalProcessed,
    totalEnriched,
    totalInserted,
    dbPath,
  };
}

if (process.argv[1] && process.argv[1].endsWith('import-rename.ts')) {
  const customPath = process.argv[2];
  importRename(customPath);
}
