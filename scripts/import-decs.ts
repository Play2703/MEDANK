/**
 * DeCS / MeSH (BIREME-OPAS/OMS 2026 Edition) Import Script for MedAnki
 *
 * Run with: npx tsx scripts/import-decs.ts [--dry-run]
 * npm script: npm run dict:import-decs
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { parseDecsXml, DecsDescriptor } from '../src/core/ner/decs/decsXmlParser';
import { shouldSkipTerm } from '../src/core/ner/decs/decsCategoryMap';

// Load .env variables if available
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {
  // Ignore env loading errors
}

interface DictionaryEntry {
  term: string;
  category: string;
  synonyms?: string[];
  codes?: Array<{ system: string; code: string }>;
}

function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const DECS_DIR = path.resolve(process.cwd(), 'scripts/seed-source/decs');
const TGZ_PATH = path.join(DECS_DIR, process.env.DECS_FTP_FILE || 'decs_portugues_2026.tgz');
const FIXTURE_PATH = path.join(DECS_DIR, 'fixtures/sample-decs.xml');
const DICTIONARY_PATH = path.resolve(process.cwd(), 'src/core/ner/medicalTerminologyPt.json');

function obtainXmlContent(): string {
  if (!fs.existsSync(DECS_DIR)) {
    fs.mkdirSync(DECS_DIR, { recursive: true });
  }

  // 1. Look for existing extracted XML files in decs directory
  const existingXmls = fs.readdirSync(DECS_DIR).filter((f) => f.endsWith('.xml') && !f.includes('sample'));
  if (existingXmls.length > 0) {
    const xmlFile = path.join(DECS_DIR, existingXmls[0]);
    console.log(`✅ Usando arquivo XML DeCS existente: ${xmlFile}`);
    return fs.readFileSync(xmlFile, 'utf-8');
  }

  // 2. Look for downloaded .tgz archive or download via FTP
  const ftpUser = process.env.DECS_FTP_USER || 'decs_pt';
  const ftpPass = process.env.DECS_FTP_PASS || '';
  const ftpHost = process.env.DECS_FTP_HOST || 'ftp.bireme.br';
  const possibleFiles = [
    process.env.DECS_FTP_FILE || 'decs_portugues_2026.tgz',
    'decs_pt_2026.tgz',
    'decs_portugues_2026.tgz',
  ];

  let localTgz: string | null = null;
  for (const f of possibleFiles) {
    const p = path.join(DECS_DIR, f);
    if (fs.existsSync(p)) {
      localTgz = p;
      break;
    }
  }

  if (!localTgz && ftpPass) {
    for (const f of possibleFiles) {
      console.log(`🌐 Baixando ${f} de ftp://${ftpHost}...`);
      try {
        const targetPath = path.join(DECS_DIR, f);
        const curlCmd = `curl -fL --user "${ftpUser}:${ftpPass}" -o "${targetPath}" "ftp://${ftpHost}/${f}"`;
        execSync(curlCmd, { stdio: 'inherit' });
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 1000) {
          localTgz = targetPath;
          break;
        }
      } catch (err: any) {
        console.warn(`⚠️ Tentativa de download de ${f} falhou: ${err.message || String(err)}`);
      }
    }
  }

  if (localTgz && fs.existsSync(localTgz)) {
    console.log(`📦 Extraindo ${localTgz}...`);
    try {
      execSync(`tar -xzf "${localTgz}" -C "${DECS_DIR}"`, { stdio: 'inherit' });
      const extractedXmls = fs.readdirSync(DECS_DIR).filter((f) => f.endsWith('.xml') && !f.includes('sample'));
      if (extractedXmls.length > 0) {
        const xmlFile = path.join(DECS_DIR, extractedXmls[0]);
        console.log(`✅ XML extraído com sucesso: ${xmlFile}`);
        return fs.readFileSync(xmlFile, 'utf-8');
      }
    } catch (err: any) {
      console.warn(`⚠️ Falha na descompactação de ${localTgz}: ${err.message || String(err)}`);
    }
  }

  // 3. Fallback for offline / sandbox testing: use sample fixture
  if (fs.existsSync(FIXTURE_PATH)) {
    console.log(`💡 Usando fixture oficial DeCS (${FIXTURE_PATH}) como fallback de ambiente.`);
    return fs.readFileSync(FIXTURE_PATH, 'utf-8');
  }

  throw new Error(`Nenhum arquivo XML do DeCS encontrado em ${DECS_DIR} e falha no download FTP.`);
}

export function importDecs(isDryRun: boolean = false) {
  console.log(`🚀 Iniciando script de importação DeCS/MeSH (BIREME 2026)${isDryRun ? ' [DRY RUN]' : ''}...`);

  const rawDict: DictionaryEntry[] = JSON.parse(fs.readFileSync(DICTIONARY_PATH, 'utf-8'));
  const initialMainTermsCount = rawDict.length;
  const initialSizeBytes = fs.statSync(DICTIONARY_PATH).size;

  let initialTotalTermsWithSynonyms = 0;
  rawDict.forEach((e) => {
    initialTotalTermsWithSynonyms += 1 + (e.synonyms ? e.synonyms.length : 0);
  });

  console.log(
    `📊 Dicionário atual: ${initialMainTermsCount} termos principais / ${initialTotalTermsWithSynonyms} com sinônimos (${(initialSizeBytes / (1024 * 1024)).toFixed(2)} MB).`
  );

  // Map normalized term/synonym -> entry index
  const normalizedToEntryMap = new Map<string, DictionaryEntry>();
  rawDict.forEach((entry) => {
    if (entry.term) {
      normalizedToEntryMap.set(normalizeText(entry.term), entry);
    }
    (entry.synonyms || []).forEach((syn) => {
      if (syn) {
        const normSyn = normalizeText(syn);
        if (!normalizedToEntryMap.has(normSyn)) {
          normalizedToEntryMap.set(normSyn, entry);
        }
      }
    });
  });

  const xmlContent = obtainXmlContent();
  console.log(`📄 Conteúdo XML DeCS carregado (${(xmlContent.length / (1024 * 1024)).toFixed(2)} MB). Parseando...`);

  const descriptors = parseDecsXml(xmlContent);
  console.log(`🔬 Descritores clínicos extraídos e categorizados do XML: ${descriptors.length}`);

  let enrichedCount = 0;
  let importedCount = 0;

  const newEntries: DictionaryEntry[] = [];

  for (const desc of descriptors) {
    const normTerm = normalizeText(desc.term);
    const existingEntry = normalizedToEntryMap.get(normTerm);

    if (existingEntry) {
      // 1. ENRIQUECE entrada existente (nunca pular, nunca alterar termo canônico ou categoria)
      let modified = false;

      // Merge synonyms
      const currentSyns = new Set((existingEntry.synonyms || []).map((s) => s.trim()));
      const normCanonical = normalizeText(existingEntry.term);

      for (const syn of desc.synonyms) {
        if (normalizeText(syn) !== normCanonical && !currentSyns.has(syn)) {
          currentSyns.add(syn);
          modified = true;
        }
      }
      existingEntry.synonyms = Array.from(currentSyns);

      // Merge codes
      if (desc.codes && desc.codes.length > 0) {
        const existingCodes = existingEntry.codes || [];
        const existingCodeKeys = new Set(existingCodes.map((c) => `${c.system}:${c.code}`));

        for (const c of desc.codes) {
          const key = `${c.system}:${c.code}`;
          if (!existingCodeKeys.has(key)) {
            existingCodes.push(c);
            existingCodeKeys.add(key);
            modified = true;
          }
        }
        existingEntry.codes = existingCodes;
      }

      if (modified) {
        enrichedCount++;
      }
    } else {
      // 2. CRIA nova entrada
      const currentSyns = new Set<string>();
      const normCanonical = normTerm;

      for (const syn of desc.synonyms) {
        if (normalizeText(syn) !== normCanonical) {
          currentSyns.add(syn);
        }
      }

      const newEntry: DictionaryEntry = {
        term: desc.term.toLowerCase(),
        category: desc.category,
        synonyms: Array.from(currentSyns),
        codes: desc.codes,
      };

      newEntries.push(newEntry);
      normalizedToEntryMap.set(normTerm, newEntry);
      for (const syn of newEntry.synonyms || []) {
        normalizedToEntryMap.set(normalizeText(syn), newEntry);
      }
      importedCount++;
    }
  }

  const finalDict = [...rawDict, ...newEntries].filter((e) => !shouldSkipTerm(e.term));

  let finalTotalTermsWithSynonyms = 0;
  finalDict.forEach((e) => {
    finalTotalTermsWithSynonyms += 1 + (e.synonyms ? e.synonyms.length : 0);
  });

  console.log(`\n==================================================`);
  console.log(`📈 RESULTADO DA IMPORTAÇÃO DECS/MESH (BIREME):`);
  console.log(`==================================================`);
  console.log(`- Descritores processados:               ${descriptors.length}`);
  console.log(`- Entidades existentes ENRIQUECIDAS:    ${enrichedCount}`);
  console.log(`- NOVAS ENTIDADES ADICIONADAS:           ${importedCount}`);
  console.log(`- Total de termos principais:            ${finalDict.length}`);
  console.log(`- Total final com sinônimos:            ${finalTotalTermsWithSynonyms}`);
  console.log(`==================================================\n`);

  if (!isDryRun) {
    const jsonOutput = JSON.stringify(finalDict, null, 2);
    fs.writeFileSync(DICTIONARY_PATH, jsonOutput, 'utf-8');
    const finalSizeBytes = fs.statSync(DICTIONARY_PATH).size;
    console.log(`🎉 Dicionário ${DICTIONARY_PATH} atualizado com sucesso!`);
    console.log(`   Tamanho final: ${(finalSizeBytes / (1024 * 1024)).toFixed(2)} MB`);
  } else {
    console.log(`ℹ️ Modos [DRY RUN] — Nenhuma alteração foi gravada em disco.`);
  }

  return {
    initialMainTermsCount,
    initialTotalTermsWithSynonyms,
    enrichedCount,
    importedCount,
    finalMainTermsCount: finalDict.length,
    finalTotalTermsWithSynonyms,
  };
}

if (process.argv[1] && process.argv[1].endsWith('import-decs.ts')) {
  const isDryRun = process.argv.includes('--dry-run');
  importDecs(isDryRun);
}
