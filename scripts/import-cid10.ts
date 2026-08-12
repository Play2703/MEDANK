/**
 * CID-10 Import Script for MedAnki Medical Terminology Dictionary
 * 
 * Run with: npx tsx scripts/import-cid10.ts
 * 
 * Fonte Oficial: DATASUS CID-10 (V2008)
 * URL: http://www2.datasus.gov.br/cid10/V2008/downloads/CID10CSV.zip
 * Tabela Utilizada: CID-10-SUBCATEGORIAS.CSV (códigos de 4 caracteres / uso clínico real)
 * Encoding: ISO-8859-1 (Latin-1)
 * Separador: ';'
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface DictionaryEntry {
  term: string;
  category: string;
  synonyms?: string[];
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

function formatCidCode(subcat: string): string {
  const s = subcat.trim();
  if (s.length === 4) {
    return `${s.slice(0, 3)}.${s.slice(3)}`;
  }
  return s;
}

const CID10_DIR = path.resolve(process.cwd(), 'scripts/seed-source/cid10');
const ZIP_PATH = path.join(CID10_DIR, 'CID10CSV.zip');
const CSV_PATH = path.join(CID10_DIR, 'CID-10-SUBCATEGORIAS.CSV');
const DICTIONARY_PATH = path.resolve(process.cwd(), 'src/core/ner/medicalTerminologyPt.json');

const DATASUS_URL = 'http://www2.datasus.gov.br/cid10/V2008/downloads/CID10CSV.zip';

function ensureCid10CsvExists(): string {
  if (fs.existsSync(CSV_PATH)) {
    console.log(`✅ Arquivo CID-10-SUBCATEGORIAS.CSV já existe em: ${CSV_PATH}`);
    return CSV_PATH;
  }

  if (!fs.existsSync(CID10_DIR)) {
    fs.mkdirSync(CID10_DIR, { recursive: true });
  }

  console.log(`🌐 Baixando pacote oficial CID10CSV.zip de ${DATASUS_URL}...`);
  try {
    // Usa curl com User-Agent de navegador para contornar bloqueios/WAF do DATASUS
    execSync(`curl -L -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -o "${ZIP_PATH}" "${DATASUS_URL}"`, { stdio: 'inherit' });
    console.log(`📦 Descompactando ${ZIP_PATH}...`);
    execSync(`unzip -o "${ZIP_PATH}" -d "${CID10_DIR}"`, { stdio: 'inherit' });
  } catch (err: any) {
    console.error(`❌ Falha no download automático do DATASUS:`, err.message || err);
    console.error(`💡 Por favor, baixe manualmente o arquivo CID10CSV.zip em http://www2.datasus.gov.br/cid10/V2008/download.htm e extraia para ${CID10_DIR}`);
    throw err;
  }

  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`Arquivo ${CSV_PATH} não encontrado após extração do ZIP.`);
  }

  return CSV_PATH;
}

export function importCid10() {
  console.log('🚀 Iniciando script de importação da CID-10 (DATASUS V2008)...');

  const csvPath = ensureCid10CsvExists();

  const rawDict: DictionaryEntry[] = JSON.parse(fs.readFileSync(DICTIONARY_PATH, 'utf-8'));
  const initialMainTermsCount = rawDict.length;
  let initialTotalTermsWithSynonyms = 0;
  rawDict.forEach((e) => {
    initialTotalTermsWithSynonyms += 1 + (e.synonyms ? e.synonyms.length : 0);
  });

  console.log(`📊 Dicionário atual: ${initialMainTermsCount} termos principais / ${initialTotalTermsWithSynonyms} com sinônimos.`);

  const existingNormalizedTerms = new Set<string>();
  rawDict.forEach((entry) => {
    if (entry.term) existingNormalizedTerms.add(normalizeText(entry.term));
    (entry.synonyms || []).forEach((syn) => {
      if (syn) existingNormalizedTerms.add(normalizeText(syn));
    });
  });

  const buffer = fs.readFileSync(csvPath);
  const text = new TextDecoder('latin1').decode(buffer);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  console.log(`📄 Total de linhas lidas em CID-10-SUBCATEGORIAS.CSV: ${lines.length}`);

  let emptyCount = 0;
  let genericCount = 0;
  let skippedExistingCount = 0;
  let importedCount = 0;

  const genericRegex = /^(outros|outra|outras|nao especificado|nao especificada|sem outra especificacao|outras formas|outros tipos)$/i;

  const newEntries: DictionaryEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(';');
    const subcat = parts[0]?.trim();
    const rawDesc = parts[4]?.trim();
    const rawDescAbrev = parts[5]?.trim();

    if (!rawDesc || !subcat) {
      emptyCount++;
      continue;
    }

    // 1. Limpa markup de colchetes no termo principal, ex: "Giardíase [lamblíase]" -> "giardíase"
    const cleanTerm = rawDesc.replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const normCleanTerm = normalizeText(cleanTerm);

    if (!normCleanTerm) {
      emptyCount++;
      continue;
    }

    // 2. Filtra descrições puramente genéricas isoladas sem contexto
    if (genericRegex.test(normCleanTerm)) {
      genericCount++;
      continue;
    }

    // 3. Verifica se termo já existe no dicionário
    if (existingNormalizedTerms.has(normCleanTerm)) {
      skippedExistingCount++;
      continue;
    }

    // 4. Constrói código CID formatado (ex: "E10.1") e sinônimos
    const cidCode = formatCidCode(subcat);
    const synonymsSet = new Set<string>();

    synonymsSet.add(cidCode);
    if (subcat !== cidCode) {
      synonymsSet.add(subcat);
    }

    // Extrai termo alternativo entre colchetes se houver
    const bracketMatch = rawDesc.match(/\[(.*?)\]/);
    if (bracketMatch) {
      const inside = bracketMatch[1].trim();
      if (inside) {
        synonymsSet.add(inside.toLowerCase());
      }
    }

    // Extrai descrição abreviada se útil
    if (rawDescAbrev) {
      const abrevText = rawDescAbrev.replace(/^[A-Z][0-9]{2}(\.[0-9]{1,2})?\s*/, '').trim().toLowerCase();
      const abrevNorm = normalizeText(abrevText);
      if (abrevText && abrevNorm !== normCleanTerm && !abrevNorm.includes(' ne ') && !abrevNorm.endsWith(' ne')) {
        synonymsSet.add(abrevText);
      }
    }

    // Evita incluir o próprio term principal na lista de sinônimos
    synonymsSet.delete(cleanTerm);

    const entry: DictionaryEntry = {
      term: cleanTerm,
      category: 'DOENCA',
      synonyms: Array.from(synonymsSet),
    };

    newEntries.push(entry);
    existingNormalizedTerms.add(normCleanTerm);
    importedCount++;
  }

  console.log(`\n==================================================`);
  console.log(`📈 RESULTADO DA IMPORTAÇÃO CID-10:`);
  console.log(`==================================================`);
  console.log(`- Subcategorias lidas do CSV:               ${lines.length - 1}`);
  console.log(`- Linhas vazias/inválidas descartadas:      ${emptyCount}`);
  console.log(`- Termos genéricos isolados ignorados:      ${genericCount}`);
  console.log(`- Termos já existentes PULADOS:             ${skippedExistingCount}`);
  console.log(`- NOVAS ENTIDADES IMPORTADAS DA CID-10:     ${importedCount}`);
  console.log(`==================================================\n`);

  // MERGE sem remover nenhum termo anterior
  const finalDict = [...rawDict, ...newEntries];

  let finalTotalTermsWithSynonyms = 0;
  finalDict.forEach((e) => {
    finalTotalTermsWithSynonyms += 1 + (e.synonyms ? e.synonyms.length : 0);
  });

  fs.writeFileSync(DICTIONARY_PATH, JSON.stringify(finalDict, null, 2), 'utf-8');
  console.log(`🎉 Dicionário ${DICTIONARY_PATH} atualizado com sucesso!`);
  console.log(`   Total final: ${finalDict.length} termos principais / ${finalTotalTermsWithSynonyms} com sinônimos.`);

  return {
    initialMainTermsCount,
    initialTotalTermsWithSynonyms,
    importedCount,
    skippedExistingCount,
    finalMainTermsCount: finalDict.length,
    finalTotalTermsWithSynonyms,
  };
}

if (process.argv[1] && process.argv[1].endsWith('import-cid10.ts')) {
  importCid10();
}
