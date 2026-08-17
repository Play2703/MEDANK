/**
 * TUSS (Terminologia Unificada da Saúde Suplementar - ANS) Import Script for MedAnki
 *
 * Imports/enriches procedure and exam terminology in medicalTerminology.db with TUSS codes and domains.
 * Run with: npx tsx scripts/import-tuss.ts [caminho_arquivo.csv]
 * npm script: npm run dict:import-tuss
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { normalizeText, ensureMetadataColumn } from './convert-to-sqlite';
import { getDbPath } from '../src/core/ner/DictionaryNEREngine';

export interface TussImportRow {
  codigo: string;
  descricao: string;
  dominio?: string;
  laboratorio?: string;
  apresentacao?: string;
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

export function inferTussCategory(dominio: string = '', descricao: string = ''): 'EXAME' | 'PROCEDIMENTO' | 'MEDICAMENTO' {
  const combined = (dominio + ' ' + descricao).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (dominio.toLowerCase().includes('medicamento') || dominio.toLowerCase().includes('tuss-20')) {
    return 'MEDICAMENTO';
  }

  const examKeywords = [
    'exame',
    'laborator',
    'diagnost',
    'imagem',
    'tomograf',
    'ressonanc',
    'ultrasson',
    'radiolog',
    'biopsia',
    'sangue',
    'urina',
    'dosagem',
    'pesquisa de',
    'analise',
    'teste',
    'cultura',
    'ecocardiograma',
    'eletrocardiograma',
    'endoscopia',
    'colonoscopia',
    'mamografia',
    'cintilografia',
    'mapa',
    'holter',
    'gasometria',
  ];

  for (const kw of examKeywords) {
    if (combined.includes(kw)) {
      return 'EXAME';
    }
  }

  return 'PROCEDIMENTO';
}

export function extractTussFields(row: Record<string, string>): TussImportRow | null {
  // Find code column (id, codigo_tuss, codigo, tuss, etc.)
  const codeKey = Object.keys(row).find((k) =>
    ['id', 'codigo_tuss', 'codigo', 'tuss', 'cod_termo', 'codigo_procedimento', 'cod_procedimento', 'cod'].includes(k)
  ) || Object.keys(row)[0];

  const code = row[codeKey]?.trim();

  // Find description / term column (display_name, termo, descricao, nome, procedimento, etc.)
  const descKey = Object.keys(row).find((k) =>
    ['display_name', 'termo', 'descricao', 'nome', 'procedimento', 'nome_do_procedimento', 'descricao_detalhada', 'evento'].includes(k)
  ) || (Object.keys(row).length > 1 ? Object.keys(row)[1] : '');

  const desc = row[descKey]?.trim();
  if (!desc) return null;

  // Find domain / category column (source, dominio, categoria, grupo, rol, etc.)
  const domKey = Object.keys(row).find((k) =>
    ['source', 'dominio', 'categoria', 'grupo', 'subgrupo', 'rol', 'capitulo', 'tabela'].includes(k)
  );
  let dominio = domKey ? row[domKey]?.trim() : undefined;
  if (dominio === 'tuss-22') dominio = 'Procedimentos e Eventos em Saúde';
  if (dominio === 'tuss-20') dominio = 'Medicamentos';

  const laboratorio = row['extras_laboratorio']?.trim();
  const apresentacao = row['extras_apresentacao']?.trim();

  return {
    codigo: code || '',
    descricao: desc,
    dominio,
    laboratorio,
    apresentacao,
  };
}

export function resolveTussSourcePaths(customPath?: string): string[] {
  if (customPath && fs.existsSync(customPath)) {
    return [path.resolve(customPath)];
  }

  const foundPaths: string[] = [];
  const defaultDir = path.resolve(process.cwd(), 'scripts/seed-source/tuss');

  if (fs.existsSync(defaultDir)) {
    const files = fs.readdirSync(defaultDir).filter((f) => f.endsWith('.csv') && !f.includes('sample'));
    for (const f of files) {
      foundPaths.push(path.join(defaultDir, f));
    }
  }

  if (foundPaths.length > 0) {
    return foundPaths;
  }

  const fallbackPaths = [
    path.resolve(process.cwd(), 'scripts/seed-source/tuss/tuss.csv'),
    path.resolve(process.cwd(), 'scripts/seed-source/tuss.csv'),
    path.resolve(process.cwd(), 'scripts/seed-source/tuss/fixtures/sample-tuss.csv'),
  ];

  for (const p of fallbackPaths) {
    if (fs.existsSync(p)) return [p];
  }

  throw new Error(
    `Nenhum arquivo CSV da TUSS encontrado. Coloque os arquivos em scripts/seed-source/tuss/ (ex: tuss-procedimentos.csv, tuss-medicamentos.csv) ou passe o caminho como argumento: npm run dict:import-tuss -- /caminho/arquivo.csv`
  );
}

export function importTuss(csvPathArg?: string): {
  totalProcessed: number;
  totalEnriched: number;
  totalInserted: number;
  dbPath: string;
} {
  const sourcePaths = resolveTussSourcePaths(csvPathArg);
  const dbPath = getDbPath();
  const rootDbPath = path.resolve(process.cwd(), 'medicalTerminology.db');

  console.log(`\n==================================================`);
  console.log(`🚀 INICIANDO IMPORTAÇÃO TUSS (ANS - Saúde Suplementar)`);
  console.log(`==================================================`);
  console.log(`- Arquivos fonte: ${sourcePaths.join(', ')}`);
  console.log(`- Banco SQLite:   ${dbPath}`);

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Banco SQLite não encontrado em ${dbPath}. Execute primeiro: npm run db:build`);
  }

  const db = new Database(dbPath);
  ensureMetadataColumn(db);

  // Performance pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Prepared queries
  const selectTermStmt = db.prepare<[string], { id: number; system: string | null; code: string | null; category: string | null; canonical_term: string | null; metadata: string | null }>(
    'SELECT id, system, code, category, canonical_term, metadata FROM terms WHERE normalized_term = ? LIMIT 1'
  );

  const updateTermStmt = db.prepare(
    'UPDATE terms SET metadata = ?, code = COALESCE(code, ?), category = COALESCE(category, ?) WHERE id = ?'
  );

  const insertTermStmt = db.prepare(
    'INSERT INTO terms (term, normalized_term, system, code, category, canonical_term, metadata) VALUES (@term, @normalized_term, @system, @code, @category, @canonical_term, @metadata)'
  );

  let totalProcessed = 0;
  let totalEnriched = 0;
  let totalInserted = 0;

  for (const sPath of sourcePaths) {
    console.log(`\n📖 Processando arquivo TUSS: ${path.basename(sPath)}...`);
    const csvContent = fs.readFileSync(sPath, 'utf-8');
    const rawRows = parseCsvLines(csvContent);
    console.log(`- Linhas lidas: ${rawRows.length}`);

    const importTx = db.transaction((rows: Array<Record<string, string>>) => {
      for (const r of rows) {
        const item = extractTussFields(r);
        if (!item || !item.descricao) continue;

        totalProcessed++;
        const canonical = item.descricao.trim();
        const normalized = normalizeText(canonical);
        if (!normalized) continue;
        if (!normalized.includes(' ') && (normalized.length <= 2 || ['para', 'com', 'sem', 'de', 'do', 'da', 'dos', 'das', 'em', 'por'].includes(normalized))) continue;

        const category = inferTussCategory(item.dominio, canonical);

        const tussMeta: Record<string, any> = {
          source: 'TUSS',
          ...(item.codigo ? { tussCode: item.codigo } : {}),
          ...(item.dominio ? { domain: item.dominio } : {}),
          ...(item.laboratorio ? { laboratorio: item.laboratorio } : {}),
          ...(item.apresentacao ? { apresentacao: item.apresentacao } : {}),
          tussIndexed: true,
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
            ...tussMeta,
          };

          updateTermStmt.run(JSON.stringify(mergedMeta), item.codigo || null, category, existing.id);
          totalEnriched++;
        } else {
          // Insert new TUSS term
          const metaStr = JSON.stringify(tussMeta);
          insertTermStmt.run({
            term: normalized,
            normalized_term: normalized,
            system: 'TUSS',
            code: item.codigo || null,
            category,
            canonical_term: canonical,
            metadata: metaStr,
          });

          if (canonical !== normalized) {
            insertTermStmt.run({
              term: canonical,
              normalized_term: normalized,
              system: 'TUSS',
              code: item.codigo || null,
              category,
              canonical_term: canonical,
              metadata: metaStr,
            });
          }
          totalInserted++;
        }
      }
    });

    console.time(`Tempo de processamento ${path.basename(sPath)}`);
    importTx(rawRows);
    console.timeEnd(`Tempo de processamento ${path.basename(sPath)}`);
  }

  db.pragma('optimize');
  db.close();

  // Sync to root medicalTerminology.db
  if (fs.existsSync(rootDbPath) && rootDbPath !== dbPath) {
    fs.copyFileSync(dbPath, rootDbPath);
  }

  console.log(`\n==================================================`);
  console.log(`✅ IMPORTAÇÃO TUSS CONCLUÍDA COM SUCESSO!`);
  console.log(`==================================================`);
  console.log(`- Total de registros processados: ${totalProcessed}`);
  console.log(`- Termos enriquecidos (DeCS/Existentes): ${totalEnriched}`);
  console.log(`- Novos termos TUSS inseridos:          ${totalInserted}`);
  console.log(`==================================================\n`);

  return {
    totalProcessed,
    totalEnriched,
    totalInserted,
    dbPath,
  };
}

if (process.argv[1] && process.argv[1].endsWith('import-tuss.ts')) {
  const customPath = process.argv[2];
  importTuss(customPath);
}
