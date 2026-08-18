/**
 * ⚠️ NODE-ONLY: nunca importar este arquivo de código que roda no navegador (usa better-sqlite3/fs/path).
 * O cliente web/mobile deve sempre usar fetch('/api/extract-entities') ou o Web Worker (lib/core/engines/ner.worker.ts).
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';


export interface MatchedEntity {
  text: string;           // trecho exato encontrado no texto original
  normalizedTerm: string; // termo canônico do dicionário
  category: string;
  startIndex: number;
  endIndex: number;
  // Código clínico padronizado (CID-10 / DeCS / MeSH / SNOMED CT)
  codeSystem?: string | null;
  code?: string | null;
}

export interface ExtractedRelation {
  sourceEntity: string;
  targetEntity: string;
  relationType: string;
  triggerPhrase: string;
  sentence: string;
}

export interface DictionaryPayload {
  canonicalTerm: string;
  category: string;
  codeSystem?: string | null;
  code?: string | null;
}

import { AhoCorasick, AhoCorasickMatch } from './ahoCorasick';
import { compactAhoCorasickEngine } from './CompactAhoCorasickEngine';
import { levenshteinDistance } from './levenshtein';

export const TOP_TERMS_FOR_L1_CACHE = 15000;

export interface TermRow {
  system: string | null;
  code: string | null;
  category?: string | null;
  canonical_term?: string | null;
  normalized_term?: string | null;
  metadata?: string | null;
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/\s+/g, ' ')
    .trim();
}

export function getDbPath(): string {
  const possiblePaths = [
    path.resolve(process.cwd(), 'src/core/ner/medicalTerminology.db'),
    path.resolve(process.cwd(), 'medicalTerminology.db'),
    typeof __dirname !== 'undefined' ? path.resolve(__dirname, 'medicalTerminology.db') : '',
  ].filter(Boolean);
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return path.resolve(process.cwd(), 'src/core/ner/medicalTerminology.db');
}

let dbInstance: Database.Database | null = null;
let selectTermStmt: Database.Statement<[string], TermRow> | null = null;
let selectLikeStmt: Database.Statement<[string], TermRow> | null = null;
let warmupPromise: Promise<boolean> | null = null;

export function getTerminologyDb(): Database.Database | null {
  if (dbInstance) return dbInstance;
  try {
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      const startTime = Date.now();
      const dbPath = getDbPath();
      if (fs.existsSync(dbPath)) {
        console.log(`[DictionaryNEREngine] Conectando ao banco SQLite: ${dbPath}...`);
        dbInstance = new Database(dbPath, { readonly: true, fileMustExist: true });
        
        // Pragmas de alta performance para leitura (sem lock em concorrência)
        dbInstance.pragma('query_only = ON');
        dbInstance.pragma('mmap_size = 67108864'); // 64MB memory-mapped IO
        
        const elapsed = Date.now() - startTime;
        console.log(`[DictionaryNEREngine] Conexão SQLite estabelecida com sucesso em ${elapsed}ms.`);
        return dbInstance;
      } else {
        console.warn(`[DictionaryNEREngine] Arquivo medicalTerminology.db não encontrado em: ${dbPath}`);
      }
    }
  } catch (err) {
    console.warn('[DictionaryNEREngine] Erro ao conectar ao medicalTerminology.db:', err);
  }
  return null;
}

export function getSelectTermStatement(): Database.Statement<[string], TermRow> | null {
  if (selectTermStmt) return selectTermStmt;
  const db = getTerminologyDb();
  if (db) {
    const t0 = Date.now();
    selectTermStmt = db.prepare<[string], TermRow>(
      'SELECT system, code, category, canonical_term, normalized_term FROM terms WHERE normalized_term = ? LIMIT 1'
    );
    console.log(`[DictionaryNEREngine] Prepared statement selectTerm compilado em ${Date.now() - t0}ms.`);
  }
  return selectTermStmt;
}

export function getSelectLikeStatement(): Database.Statement<[string], TermRow> | null {
  if (selectLikeStmt) return selectLikeStmt;
  const db = getTerminologyDb();
  if (db) {
    const t0 = Date.now();
    selectLikeStmt = db.prepare<[string], TermRow>(
      'SELECT system, code, category, canonical_term, normalized_term FROM terms WHERE normalized_term LIKE ? LIMIT 60'
    );
    console.log(`[DictionaryNEREngine] Prepared statement selectLike compilado em ${Date.now() - t0}ms.`);
  }
  return selectLikeStmt;
}


export const COMMON_STOP_WORDS = new Set([
  'pode', 'para', 'como', 'mais', 'pelo', 'pela', 'sobre', 'onde', 'quando',
  'esta', 'este', 'essa', 'esse', 'foram', 'sendo', 'caso', 'grau', 'tipo',
  'alta', 'baixa', 'todo', 'toda', 'qual', 'quais', 'cada', 'entre', 'apenas',
  'muito', 'muita', 'outro', 'outra', 'geral', 'total', 'fase', 'hipotese',
  'acao', 'efeito', 'terapia', 'inicia', 'segue', 'ate', 'as', 'os', 'ao', 'aos',
  'reuniao', 'negocios', 'financeiro', 'ocorreu', 'segunda', 'manha',
  'risco', 'causa', 'causar', 'causam', 'tratamento', 'inclui', 'fatores',
  'diagnostico', 'diagnostica', 'paciente', 'apresenta', 'evoluiu', 'quadro',
  'sintoma', 'sintomas', 'sinal', 'sinais', 'indicado', 'relato', 'exame'
]);

/**
 * Resilient Two-Step Term Lookup:
 * Step A: Exact normalized term lookup on indexed column `normalized_term` (0ms).
 * Step B: Typo-tolerance fallback using LIKE prefix query + Levenshtein distance <= 2.
 */
export function lookupTerm(term: string, enableTypoTolerance = true): TermRow | undefined {
  if (!term || typeof term !== 'string') return undefined;
  const norm = normalizeText(term);
  if (!norm) return undefined;

  // Single-word stop words should never be matched as standalone entities
  if (!norm.includes(' ') && COMMON_STOP_WORDS.has(norm)) {
    return undefined;
  }

  // Step A: Exact match on normalized_term
  const stmt = getSelectTermStatement();
  if (stmt) {
    const row = stmt.get(norm);
    if (row) return row;
  }

  // Step B: Typo-tolerance fallback via Levenshtein
  if (enableTypoTolerance) {
    const normWordCount = norm.split(' ').length;
    // Tolerância a erro via Levenshtein deve focar em palavras simples (evita overhead quadrático em n-grams)
    if (normWordCount !== 1 || norm.length < 5 || COMMON_STOP_WORDS.has(norm)) {
      return undefined;
    }

    const likeStmt = getSelectLikeStatement();
    if (likeStmt) {
      const prefixLen = norm.length <= 5 ? 3 : 4;
      const prefix = norm.slice(0, prefixLen);

      const candidates = likeStmt.all(`${prefix}%`);

      let bestMatch: TermRow | undefined;
      let minDistance = 3; // Must be <= 2
      let minLenDiff = 999;

      for (const candidate of candidates) {
        const cNorm = candidate.normalized_term || normalizeText(candidate.canonical_term || '');
        if (!cNorm || COMMON_STOP_WORDS.has(cNorm)) continue;

        // Candidate must have the EXACT SAME word count as the search span
        if (cNorm.split(' ').length !== normWordCount) continue;

        // Length difference must be <= 1
        const lenDiff = Math.abs(norm.length - cNorm.length);
        if (lenDiff > 1) continue;

        const maxThreshold = norm.length < 7 ? 1 : 2;
        const dist = levenshteinDistance(norm, cNorm, maxThreshold);
        if (dist <= maxThreshold) {
          if (dist < minDistance || (dist === minDistance && lenDiff < minLenDiff)) {
            minDistance = dist;
            minLenDiff = lenDiff;
            bestMatch = candidate;
          }
        }
      }

      if (bestMatch) {
        return bestMatch;
      }
    }
  }

  return undefined;
}


export function getTerminology(): any[] {
  const db = getTerminologyDb();
  if (!db) return [];
  try {
    return db.prepare('SELECT DISTINCT canonical_term as term, category FROM terms').all();
  } catch {
    return [];
  }
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

export function getRelatedEntitiesFromDb(
  canonicalCode: string,
  filterPredicate?: string
): RelatedEntityConnection[] {
  const db = getTerminologyDb();
  if (!db || !canonicalCode) return [];

  try {
    const normCode = normalizeText(canonicalCode);
    const results: RelatedEntityConnection[] = [];

    // 1. Outgoing edges (code -> target)
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
    const outRows = db.prepare(outSql).all(...outParams) as RelatedEntityConnection[];
    results.push(...outRows);

    // 2. Incoming edges (source -> code)
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
    const inRows = db.prepare(inSql).all(...inParams) as RelatedEntityConnection[];
    results.push(...inRows);

    return results;
  } catch (err) {
    console.warn('[DictionaryNEREngine] Erro ao consultar conexões do grafo:', err);
    return [];
  }
}

export function getGraphNodeByCode(canonicalCode: string): any | null {
  const db = getTerminologyDb();
  if (!db || !canonicalCode) return null;
  try {
    const normCode = normalizeText(canonicalCode);
    const row = db.prepare(
      'SELECT id, canonical_code, code_system, type, display_text, occurrence_count FROM graph_nodes WHERE canonical_code = ? OR canonical_code = ? LIMIT 1'
    ).get(canonicalCode, normCode);
    return row || null;
  } catch {
    return null;
  }
}


// Gatilhos de relação: frase encontrada entre duas entidades na mesma sentença -> tipo de relação
const RELATION_TRIGGERS: { pattern: RegExp; type: string }[] = [
  // CAUSA
  { pattern: /\bcausa(m)?\b/, type: 'CAUSA' },
  { pattern: /\bpode causar\b/, type: 'CAUSA' },
  { pattern: /\bprovoca(m)?\b/, type: 'CAUSA' },
  { pattern: /\blevam? a\b/, type: 'CAUSA' },
  { pattern: /\bresulta(m)? em\b/, type: 'CAUSA' },
  { pattern: /\bdesencadeia(m)?\b/, type: 'CAUSA' },
  { pattern: /\bpode levar a\b|\bpodem levar a\b/, type: 'CAUSA' },
  { pattern: /\bé responsável por\b|\bsão responsáveis por\b/, type: 'CAUSA' },
  { pattern: /\bocasiona(m)?\b/, type: 'CAUSA' },

  // TRATAMENTO
  { pattern: /\btrata(m)?\b|\btratamento (para|de|inclui)\b/, type: 'TRATAMENTO' },
  { pattern: /\bindicado (para|em)\b|\bindicados? (para|em)\b/, type: 'TRATAMENTO' },
  { pattern: /\bo tratamento consiste em\b/, type: 'TRATAMENTO' },
  { pattern: /\butilizado(a)? (no|na|para o|para a) tratamento\b/, type: 'TRATAMENTO' },
  { pattern: /\badministra(-se)?\b/, type: 'TRATAMENTO' },
  { pattern: /\bprescrito(a)? (para|em)\b/, type: 'TRATAMENTO' },
  { pattern: /\bde escolha (para|no tratamento de)\b/, type: 'TRATAMENTO' },
  { pattern: /\bterapia (para|de|com)\b/, type: 'TRATAMENTO' },

  // FATOR_DE_RISCO
  { pattern: /\bfator(es)? de risco (para|de)\b/, type: 'FATOR_DE_RISCO' },
  { pattern: /\baumenta(m)? o risco de\b/, type: 'FATOR_DE_RISCO' },
  { pattern: /\bpredisp(õe|õem) a\b|\bpredispõe a\b/, type: 'FATOR_DE_RISCO' },
  { pattern: /\bfavorece(m)? o (desenvolvimento|aparecimento) de\b/, type: 'FATOR_DE_RISCO' },

  // CONTRAINDICACAO
  { pattern: /\bcontraindicad[oa]s? (em|para)\b/, type: 'CONTRAINDICACAO' },
  { pattern: /\bnão deve(m)? ser (usado|administrado|utilizado)s? (em|com|na presença de)\b/, type: 'CONTRAINDICACAO' },
  { pattern: /\bevitar (o uso de|em)\b/, type: 'CONTRAINDICACAO' },

  // MANIFESTACAO
  { pattern: /\bsintoma(s)? de\b|\bmanifesta-se com\b|\bapresenta-se com\b/, type: 'MANIFESTACAO' },
  { pattern: /\bcaracteriza(-se)? por\b/, type: 'MANIFESTACAO' },
  { pattern: /\bcursa(m)? com\b/, type: 'MANIFESTACAO' },
  { pattern: /\bmanifesta(m)?-se por\b/, type: 'MANIFESTACAO' },
  { pattern: /\bpode(m)? apresentar\b/, type: 'MANIFESTACAO' },

  // ASSOCIACAO
  { pattern: /\bassociad[oa]s? (a|com)\b|\brelacionad[oa]s? (a|com)\b/, type: 'ASSOCIACAO' },
  { pattern: /\bcorrelaciona(-se)? com\b/, type: 'ASSOCIACAO' },

  // DIAGNOSTICO_POR
  { pattern: /\bdiagnosticad[oa]s? (por|com|através de)\b/, type: 'DIAGNOSTICO_POR' },
  { pattern: /\bconfirmado(a)? (por|com|através de)\b/, type: 'DIAGNOSTICO_POR' },
  { pattern: /\bdetectad[oa]s? (por|com|através de)\b/, type: 'DIAGNOSTICO_POR' },
  { pattern: /\bo exame de escolha (é|para)\b/, type: 'DIAGNOSTICO_POR' },

  // MECANISMO_DE_ACAO
  { pattern: /\bage(m)? (sobre|em|no|na)\b|\batua(m)? (sobre|em|no|na)\b/, type: 'MECANISMO_DE_ACAO' },
  { pattern: /\binibe(m)?\b/, type: 'MECANISMO_DE_ACAO' },
  { pattern: /\bestimula(m)?\b/, type: 'MECANISMO_DE_ACAO' },
  { pattern: /\bbloqueia(m)?\b/, type: 'MECANISMO_DE_ACAO' },
  { pattern: /\bativa(m)?\b/, type: 'MECANISMO_DE_ACAO' },
  { pattern: /\breduz(em)?\b/, type: 'MECANISMO_DE_ACAO' },
  { pattern: /\baumenta(m)? a (produção|secreção|liberação) de\b/, type: 'MECANISMO_DE_ACAO' },

  // EFEITO_ADVERSO
  { pattern: /\befeito(s)? colateral(is)? (de|do|da)\b/, type: 'EFEITO_ADVERSO' },
  { pattern: /\befeito(s)? adverso(s)? (de|do|da)\b/, type: 'EFEITO_ADVERSO' },
  { pattern: /\bpode(m)? causar como efeito colateral\b/, type: 'EFEITO_ADVERSO' },
  { pattern: /\breação(ões)? adversa(s)? (a|ao|à)\b/, type: 'EFEITO_ADVERSO' },

  // PREVENCAO
  { pattern: /\bprevine(m)?\b/, type: 'PREVENCAO' },
  { pattern: /\breduz(em)? o risco de\b/, type: 'PREVENCAO' },
  { pattern: /\bprofilaxia (para|de|do|da)\b/, type: 'PREVENCAO' },

  // IRRIGACAO (novo)
  { pattern: /\birriga(m)?\b/, type: 'IRRIGACAO' },
  { pattern: /\bsuprido(a)? por\b|\bsupre(m)?\b/, type: 'IRRIGACAO' },
  { pattern: /\bvasculariza(m|do|da)?\b/, type: 'IRRIGACAO' },

  // INERVACAO (novo)
  { pattern: /\bineva(m)?\b|\binerva(m)?\b/, type: 'INERVACAO' },
  { pattern: /\binervado(a)? por\b/, type: 'INERVACAO' },

  // DRENAGEM (novo)
  { pattern: /\bdrena(m)?\b/, type: 'DRENAGEM' },
  { pattern: /\bdrenado(a)? por\b/, type: 'DRENAGEM' },

  // LOCALIZACAO (novo)
  { pattern: /\blocaliza(-se)? (em|no|na)\b|\bsitua(-se)? (em|no|na)\b/, type: 'LOCALIZACAO' },
  { pattern: /\bencontra(-se)? (em|no|na)\b/, type: 'LOCALIZACAO' },

  // COMPOSICAO (novo)
  { pattern: /\bcompõe(m)?\b|\bcompo[e|õe] (o|a)\b/, type: 'COMPOSICAO' },
  { pattern: /\bfaz(em)? parte (de|do|da)\b|\bconstitui(em)?\b/, type: 'COMPOSICAO' },

  // REGULACAO (novo — fecha a lacuna de fisiologia regulatória, ex: eixo hormonal)
  { pattern: /\bregula(m)?\b/, type: 'REGULACAO' },
  { pattern: /\bcontrola(m)?\b/, type: 'REGULACAO' },
  { pattern: /\bmodula(m)?\b/, type: 'REGULACAO' },

  // CLASSIFICACAO (novo — comum em didática de ciclo básico e classificações clínicas)
  { pattern: /\bclassifica(-se)? em\b|\b[eé] classificad[oa] como\b/, type: 'CLASSIFICACAO' },
  { pattern: /\bsubdivide(-se)? em\b|\bdivide(-se)? em\b/, type: 'CLASSIFICACAO' },
  { pattern: /\btipos? de\b(?=.{0,40}\b(classifica[cç][aã]o|classificam)\b)/, type: 'CLASSIFICACAO' },

  // EPIDEMIOLOGIA (novo — conecta doença/condição a população/faixa etária/prevalência)
  { pattern: /\bmais comum (em|no|na)\b|\bmais frequente (em|no|na)\b/, type: 'EPIDEMIOLOGIA' },
  { pattern: /\bacomete(m)? principalmente\b|\bacomete(m)? predominantemente\b/, type: 'EPIDEMIOLOGIA' },
  { pattern: /\bprevalente (em|no|na)\b|\bpreval[eê]ncia (em|no|na)\b/, type: 'EPIDEMIOLOGIA' },
  { pattern: /\bincide(m)? (em|sobre)\b/, type: 'EPIDEMIOLOGIA' },

  // COMPLICACAO (novo — progressão/evolução da doença, distinto de EFEITO_ADVERSO que é reação a medicamento)
  { pattern: /\bevolui(em)? para\b|\bpode(m)? evoluir para\b/, type: 'COMPLICACAO' },
  { pattern: /\bcomplica(-se)? com\b|\bcomplica[cç][aã]o(ões|oes)? (de|do|da)\b/, type: 'COMPLICACAO' },
  { pattern: /\bpode(m)? progredir para\b/, type: 'COMPLICACAO' },

  // PROGNOSTICO (novo)
  { pattern: /\bprogn[oó]stico (reservado|favor[aá]vel|desfavor[aá]vel|bom|ruim)\b/, type: 'PROGNOSTICO' },
  { pattern: /\btaxa(s)? de (mortalidade|sobrevida) (de|em|para)\b/, type: 'PROGNOSTICO' },
];

export const NEGATION_MARKERS = [
  'não', 'nunca', 'jamais', 'nenhum', 'nenhuma', 'sem', 'ausência de',
  'raramente', 'dificilmente', 'não costuma', 'não deve ser confundido com',
];

const NORMALIZED_NEGATION_PATTERNS = NEGATION_MARKERS.map((marker) => {
  const norm = normalizeText(marker);
  return new RegExp(`\\b${norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
});

function hasNegationBeforeTrigger(
  normalizedSentence: string,
  trigStartIndex: number,
  sourceRelEnd: number,
  prevTriggerEnd: number
): boolean {
  const startBound = Math.max(0, prevTriggerEnd, Math.min(sourceRelEnd, trigStartIndex));
  const textBetween = normalizedSentence.slice(startBound, trigStartIndex);
  const words = textBetween.trim().split(/\s+/).filter(Boolean);
  const windowText = words.slice(-5).join(' ');
  if (!windowText) return false;
  return NORMALIZED_NEGATION_PATTERNS.some((pattern) => pattern.test(windowText));
}

interface Token {
  text: string;
  startIndex: number;
  endIndex: number;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const regex = /[a-zA-Z0-9\u00C0-\u024F]+(?:[\.\-][a-zA-Z0-9\u00C0-\u024F]+)*/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    tokens.push({
      text: match[0],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }
  return tokens;
}

export class DictionaryNEREngine {
  private isWarmedUp = false;
  private automaton: AhoCorasick<DictionaryPayload> | null = null;
  public l1TermsCount = 0;
  public l1MemoryDeltaMB = 0;
  public l1BuildDurationMs = 0;

  constructor() {
    // Construtor totalmente desacoplado de I/O síncrono no boot
  }

  /**
   * Constrói o autômato Aho-Corasick L1 em memória com os N termos mais frequentes e prioritários.
   */
  private buildL1Automaton(db: Database.Database): AhoCorasick<DictionaryPayload> {
    const automaton = new AhoCorasick<DictionaryPayload>();
    
    // 1. Termos observados na semente (dados de frequência real da biblioteca)
    const seedTermsSet = new Set<string>();
    const seedIndexPaths = [
      path.resolve(process.cwd(), 'public/seed-data/canonical-entity-index.json'),
      path.resolve(process.cwd(), 'seed-data/canonical-entity-index.json'),
    ];
    for (const p of seedIndexPaths) {
      if (fs.existsSync(p)) {
        try {
          const indexData = JSON.parse(fs.readFileSync(p, 'utf-8'));
          for (const item of Object.values(indexData) as any[]) {
            const key = normalizeText(item.canonicalKey || item.displayText || '');
            if (key) seedTermsSet.add(key);
            if (Array.isArray(item.seenTexts)) {
              for (const st of item.seenTexts) {
                const normSt = normalizeText(st);
                if (normSt) seedTermsSet.add(normSt);
              }
            }
          }
          break;
        } catch {}
      }
    }

    // String interning para economizar memória do V8
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

    const selectedRows: TermRow[] = [];
    const seen = new Set<string>();

    const findStmt = db.prepare<[string], TermRow>(
      'SELECT normalized_term, canonical_term, category, system, code FROM terms WHERE normalized_term = ? LIMIT 1'
    );

    for (const st of seedTermsSet) {
      const r = findStmt.get(st);
      if (r && r.normalized_term && !seen.has(r.normalized_term)) {
        seen.add(r.normalized_term);
        selectedRows.push(r);
      }
    }

    // 2. Preencher com DOENCA, MEDICAMENTO, SINTOMA, etc., respeitando o teto TOP_TERMS_FOR_L1_CACHE
    const remainingNeeded = Math.max(0, TOP_TERMS_FOR_L1_CACHE - selectedRows.length);
    if (remainingNeeded > 0) {
      const fillRows = db.prepare<[number], TermRow>(`
        SELECT normalized_term, canonical_term, category, system, code 
        FROM terms 
        WHERE normalized_term IS NOT NULL AND length(normalized_term) > 0
        GROUP BY normalized_term
        ORDER BY 
          CASE category 
            WHEN 'DOENCA' THEN 1 
            WHEN 'MEDICAMENTO' THEN 2 
            WHEN 'SINTOMA' THEN 3 
            WHEN 'ESTRUTURA_ANATOMICA' THEN 4
            ELSE 5 
          END ASC,
          length(normalized_term) DESC
        LIMIT ?
      `).all(remainingNeeded + 5000);

      for (const r of fillRows) {
        if (selectedRows.length >= TOP_TERMS_FOR_L1_CACHE) break;
        if (r.normalized_term && !seen.has(r.normalized_term)) {
          seen.add(r.normalized_term);
          selectedRows.push(r);
        }
      }
    }

    // 3. Alimentar o autômato
    for (const row of selectedRows) {
      const norm = row.normalized_term!;
      automaton.add(norm, {
        canonicalTerm: (intern(row.canonical_term) || norm),
        category: (intern(row.category) || 'DOENCA'),
        codeSystem: intern(row.system),
        code: intern(row.code),
      });
    }

    automaton.build();
    this.l1TermsCount = selectedRows.length;
    return automaton;
  }

  /**
   * Inicialização e aquecimento assíncrono do motor terminológico.
   * Prioridade 1: Carrega autômato binário compacto em TypedArrays (100% in-memory, ~60MB, <30ms boot).
   * Fallback de Segurança: Constrói camada L1 e prepara SQLite L2 apenas se o arquivo binário falhar.
   */
  public async warmup(): Promise<boolean> {
    if (this.isWarmedUp) return true;
    if (warmupPromise) return warmupPromise;

    warmupPromise = (async () => {
      const start = Date.now();
      const baselineHeap = typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage().heapUsed : 0;

      // ══ 1. Tenta carregar o autômato binário compilado (Zero SQLite) ══
      const datPaths = [
        path.resolve(process.cwd(), 'src/core/ner/medicalTerminology.automaton.dat'),
        path.resolve(process.cwd(), 'medicalTerminology.automaton.dat'),
        path.resolve(__dirname, 'medicalTerminology.automaton.dat'),
      ];

      for (const p of datPaths) {
        if (fs.existsSync(p)) {
          const loaded = compactAhoCorasickEngine.load(p);
          if (loaded) {
            const afterHeap = typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage().heapUsed : 0;
            this.l1MemoryDeltaMB = (afterHeap - baselineHeap) / 1024 / 1024;
            this.l1TermsCount = compactAhoCorasickEngine.termsCount;
            this.l1BuildDurationMs = compactAhoCorasickEngine.loadDurationMs;
            this.isWarmedUp = true;
            console.log(
              `[DictionaryNEREngine] ✅ Warmup concluído via Autômato Binário em ${Date.now() - start}ms (${this.l1TermsCount} termos, Delta Heap: ${this.l1MemoryDeltaMB.toFixed(2)} MB, Zero SQLite em requisições).`
            );
            return true;
          }
        }
      }

      // Se o arquivo .dat não existir, compila automaticamente a partir do SQLite em ~3s
      const sqlitePath = path.resolve(process.cwd(), 'src/core/ner/medicalTerminology.db');
      const targetDatPath = path.resolve(process.cwd(), 'src/core/ner/medicalTerminology.automaton.dat');
      if (fs.existsSync(sqlitePath)) {
        try {
          console.log(`[DictionaryNEREngine] Autômato binário ausente. Compilando automaticamente a partir do SQLite: ${sqlitePath}...`);
          const { buildNERAutomaton } = await import('../../../scripts/build-ner-automaton');
          buildNERAutomaton(sqlitePath, targetDatPath);
          const loaded = compactAhoCorasickEngine.load(targetDatPath);
          if (loaded) {
            const afterHeap = typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage().heapUsed : 0;
            this.l1MemoryDeltaMB = (afterHeap - baselineHeap) / 1024 / 1024;
            this.l1TermsCount = compactAhoCorasickEngine.termsCount;
            this.l1BuildDurationMs = compactAhoCorasickEngine.loadDurationMs;
            this.isWarmedUp = true;
            console.log(
              `[DictionaryNEREngine] ✅ Autômato binário auto-compilado e carregado em ${Date.now() - start}ms (${this.l1TermsCount} termos, Zero SQLite em requisições).`
            );
            return true;
          }
        } catch (compileErr) {
          console.warn('[DictionaryNEREngine] Falha ao auto-compilar autômato binário:', compileErr);
        }
      }

      console.warn(
        `[DictionaryNEREngine] ⚠️ Autômato binário não encontrado e não compilado. Ativando modo de segurança com fallback SQLite...`
      );

      // ══ 2. Fallback de Segurança: SQLite L1/L2 ══
      try {
        const db = getTerminologyDb();
        if (db) {
          getSelectTermStatement();
          getSelectLikeStatement();

          const t0Aut = Date.now();
          this.automaton = this.buildL1Automaton(db);
          this.l1BuildDurationMs = Date.now() - t0Aut;

          const afterHeap = typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage().heapUsed : 0;
          this.l1MemoryDeltaMB = (afterHeap - baselineHeap) / 1024 / 1024;

          const countRow = db.prepare('SELECT COUNT(*) as count FROM terms').get() as { count: number };
          const elapsed = Date.now() - start;
          console.log(
            `[DictionaryNEREngine] Modo de segurança inicializado em ${elapsed}ms: Autômato L1 construído com ${this.l1TermsCount} termos (Delta Heap: ${this.l1MemoryDeltaMB.toFixed(2)} MB, Total DB: ${countRow?.count ?? 0} termos).`
          );
          this.isWarmedUp = true;
          return true;
        } else {
          console.warn('[DictionaryNEREngine] Warmup falhou: SQLite database não disponível.');
          return false;
        }
      } catch (err) {
        console.warn('[DictionaryNEREngine] Erro durante warmup em modo de segurança:', err);
        return false;
      }
    })();

    return warmupPromise;
  }

  public reload(): void {
    if (dbInstance) {
      try {
        dbInstance.close();
      } catch {}
      dbInstance = null;
    }
    selectTermStmt = null;
    selectLikeStmt = null;
    this.automaton = null;
    this.isWarmedUp = false;
    warmupPromise = null;
  }

  /**
   * Extração de entidades médicas:
   * 1. Caminho normal (Produção): Autômato Aho-Corasick binário compacto 100% em memória em O(N + M) (Zero SQLite).
   * 2. Modo de segurança: Fallback SQLite L1/L2 se o autômato binário não estiver carregado.
   */
  extractEntities(text: string): MatchedEntity[] {
    if (!text || typeof text !== 'string' || !text.trim()) {
      return [];
    }

    // ══ 1. CAMINHO PRINCIPAL: Autômato Binário Compacto em Memória ══
    if (!compactAhoCorasickEngine.isLoaded) {
      const datPaths = [
        path.resolve(process.cwd(), 'src/core/ner/medicalTerminology.automaton.dat'),
        path.resolve(process.cwd(), 'medicalTerminology.automaton.dat'),
        path.resolve(__dirname, 'medicalTerminology.automaton.dat'),
      ];
      for (const p of datPaths) {
        if (fs.existsSync(p)) {
          compactAhoCorasickEngine.load(p);
          if (compactAhoCorasickEngine.isLoaded) break;
        }
      }
    }

    if (compactAhoCorasickEngine.isLoaded) {
      const matches = compactAhoCorasickEngine.extractEntities(text);
      if (typeof console !== 'undefined' && console.debug) {
        console.debug(
          `[DictionaryNEREngine] extractEntities telemetria: ${matches.length} entidades extraídas via Autômato Binário (Zero SQLite) para texto de ${text.length} caracteres.`
        );
      }
      return matches;
    }

    // ══ 2. MODO DE SEGURANÇA: Fallback SQLite L1 + L2 ══
    console.warn('[DictionaryNEREngine] [MODO DE SEGURANÇA] Executando extração via fallback SQLite...');
    const tokens = tokenize(text);
    if (tokens.length === 0) {
      return [];
    }

    if (!this.automaton) {
      const db = getTerminologyDb();
      if (db) {
        try {
          this.automaton = this.buildL1Automaton(db);
          this.isWarmedUp = true;
        } catch {}
      }
    }

    const rawMatches: Array<MatchedEntity & { isExact: boolean; source: 'L1' | 'L2' }> = [];
    const normTokens = tokens.map((t) => normalizeText(t.text));
    const normJoined = normTokens.join(' ');

    const startTokenMap = new Map<number, number>();
    const endTokenMap = new Map<number, number>();
    let charOffset = 0;
    for (let i = 0; i < normTokens.length; i++) {
      startTokenMap.set(charOffset, i);
      charOffset += normTokens[i].length;
      endTokenMap.set(charOffset, i);
      charOffset += 1; // espaço delimitador
    }

    // 1. Camada L1: Busca em memória via Aho-Corasick em O(N + M)
    const l1MatchesByTokenStart = new Map<number, number>();
    if (this.automaton) {
      const acMatches = this.automaton.search(normJoined);
      for (const m of acMatches) {
        const firstTokIdx = startTokenMap.get(m.startIndex);
        const lastTokIdx = endTokenMap.get(m.endIndex);
        if (firstTokIdx === undefined || lastTokIdx === undefined) {
          continue; // Rejeita se não estiver em fronteira exata de palavra/token
        }

        if (!m.keyword.includes(' ') && COMMON_STOP_WORDS.has(m.keyword)) {
          continue; // Rejeita stop-words de palavra única
        }

        const startIdx = tokens[firstTokIdx].startIndex;
        const endIdx = tokens[lastTokIdx].endIndex;
        const rawText = text.slice(startIdx, endIdx);
        const tokCount = lastTokIdx - firstTokIdx + 1;

        rawMatches.push({
          text: rawText,
          normalizedTerm: m.value.canonicalTerm || rawText,
          category: m.value.category || 'DOENCA',
          startIndex: startIdx,
          endIndex: endIdx,
          codeSystem: m.value.codeSystem ?? null,
          code: m.value.code ?? null,
          isExact: true,
          source: 'L1',
        });

        const currMax = l1MatchesByTokenStart.get(firstTokIdx) || 0;
        if (tokCount > currMax) {
          l1MatchesByTokenStart.set(firstTokIdx, tokCount);
        }
      }
    }

    // 2. Mapeia tokens cobertos pelo L1
    const tokenCoveredByL1 = new Array<boolean>(tokens.length).fill(false);
    for (const m of rawMatches) {
      for (let t = 0; t < tokens.length; t++) {
        if (tokens[t].startIndex >= m.startIndex && tokens[t].endIndex <= m.endIndex) {
          tokenCoveredByL1[t] = true;
        }
      }
    }

    // 3. Camada L2: Fallback SQLite com janela deslizante + Levenshtein
    // Se o L1 já casou um prefixo de tamanho K iniciando no token i, consulta o SQLite apenas para spans maiores (8 até K+1).
    // Se o token i não foi coberto por nenhum match L1, consulta spans de 8 até 1.
    const maxSpanLength = 8;
    for (let i = 0; i < tokens.length; i++) {
      const maxLen = Math.min(tokens.length - i, maxSpanLength);
      const l1MaxLen = l1MatchesByTokenStart.get(i) || 0;

      let minLen = 1;
      if (l1MaxLen > 0) {
        minLen = l1MaxLen + 1;
      } else if (tokenCoveredByL1[i]) {
        continue;
      }

      if (minLen > maxLen) continue;

      for (let len = maxLen; len >= minLen; len--) {
        const startIdx = tokens[i].startIndex;
        const endIdx = tokens[i + len - 1].endIndex;
        const rawText = text.slice(startIdx, endIdx);
        const row = lookupTerm(rawText);

        if (row) {
          const normRaw = normalizeText(rawText);
          const isExact = (row.normalized_term || '').toLowerCase() === normRaw;
          rawMatches.push({
            text: rawText,
            normalizedTerm: row.canonical_term || rawText,
            category: row.category || 'DOENCA',
            startIndex: startIdx,
            endIndex: endIdx,
            codeSystem: row.system ?? null,
            code: row.code ?? null,
            isExact,
            source: 'L2',
          });
        }
      }
    }

    // 4. Prioriza matches exatos sobre aproximações e depois termos mais longos
    rawMatches.sort((a, b) => {
      if (a.isExact !== b.isExact) {
        return a.isExact ? -1 : 1;
      }
      const lenA = a.endIndex - a.startIndex;
      const lenB = b.endIndex - b.startIndex;
      if (lenB !== lenA) return lenB - lenA;
      return a.startIndex - b.startIndex;
    });

    const entities: MatchedEntity[] = [];
    const occupied: boolean[] = new Array(text.length).fill(false);
    let l1Hits = 0;
    let l2Hits = 0;

    for (const match of rawMatches) {
      const { startIndex, endIndex } = match;

      // Verifica se essa região do texto já foi ocupada por um termo maior já casado
      let alreadyOccupied = false;
      for (let i = startIndex; i < endIndex; i++) {
        if (occupied[i]) {
          alreadyOccupied = true;
          break;
        }
      }
      if (alreadyOccupied) continue;

      for (let i = startIndex; i < endIndex; i++) occupied[i] = true;
      if (match.source === 'L1') l1Hits++;
      else l2Hits++;
      entities.push(match);
    }

    // Telemetria (visível em modo debug/desenvolvimento)
    if (typeof console !== 'undefined' && console.debug) {
      console.debug(
        `[DictionaryNEREngine] extractEntities telemetria: ${l1Hits} L1 (Aho-Corasick), ${l2Hits} L2 (SQLite fallback) para texto de ${text.length} caracteres.`
      );
    }

    return entities.sort((a, b) => a.startIndex - b.startIndex);
  }

  extractRelations(text: string, entities: MatchedEntity[]): ExtractedRelation[] {
    const relations: ExtractedRelation[] = [];
    // Divide o texto em sentenças por ponto final, exclamação ou interrogação
    const sentenceBoundaries: number[] = [0];
    for (let i = 0; i < text.length; i++) {
      if (['.', '!', '?'].includes(text[i])) sentenceBoundaries.push(i + 1);
    }
    sentenceBoundaries.push(text.length);

    for (let s = 0; s < sentenceBoundaries.length - 1; s++) {
      const sentStart = sentenceBoundaries[s];
      const sentEnd = sentenceBoundaries[s + 1];
      const sentence = text.slice(sentStart, sentEnd);
      const entitiesInSentence = entities.filter((e) => e.startIndex >= sentStart && e.endIndex <= sentEnd);
      if (entitiesInSentence.length < 2) continue;

      const normalizedSentence = normalizeText(sentence);

      interface TriggerMatch {
        startIndex: number;
        endIndex: number;
        triggerPhrase: string;
        type: string;
      }
      const triggerMatches: TriggerMatch[] = [];

      for (const { pattern, type } of RELATION_TRIGGERS) {
        const globalRegex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
        let m: RegExpExecArray | null;
        while ((m = globalRegex.exec(normalizedSentence)) !== null) {
          triggerMatches.push({
            startIndex: m.index,
            endIndex: m.index + m[0].length,
            triggerPhrase: m[0],
            type,
          });
        }
      }

      if (triggerMatches.length === 0) continue;

      triggerMatches.sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex);

      for (let i = 0; i < triggerMatches.length; i++) {
        const trig = triggerMatches[i];
        const prevTriggerEnd = i === 0 ? 0 : triggerMatches[i - 1].endIndex;
        const nextTriggerStart = i === triggerMatches.length - 1 ? normalizedSentence.length : triggerMatches[i + 1].startIndex;

        const sourceEntities = entitiesInSentence.filter((e) => {
          const relEnd = e.endIndex - sentStart;
          return relEnd <= trig.startIndex && relEnd > prevTriggerEnd;
        });

        const targetEntities = entitiesInSentence.filter((e) => {
          const relStart = e.startIndex - sentStart;
          return relStart >= trig.endIndex && relStart < nextTriggerStart;
        });

        if (sourceEntities.length === 0 || targetEntities.length === 0) continue;

        for (const source of sourceEntities) {
          const sourceRelEnd = source.endIndex - sentStart;
          const isNegated = hasNegationBeforeTrigger(
            normalizedSentence,
            trig.startIndex,
            sourceRelEnd,
            prevTriggerEnd
          );

          const relationType = isNegated
            ? (trig.type.startsWith('NEGACAO_') ? trig.type : `NEGACAO_${trig.type}`)
            : trig.type;

          for (const target of targetEntities) {
            if (source.normalizedTerm === target.normalizedTerm) continue;

            relations.push({
              sourceEntity: source.normalizedTerm,
              targetEntity: target.normalizedTerm,
              relationType,
              triggerPhrase: trig.triggerPhrase,
              sentence: sentence.trim(),
            });
          }
        }
      }
    }

    return relations;
  }

  public lookup(term: string, enableTypoTolerance = true): TermRow | undefined {
    return lookupTerm(term, enableTypoTolerance);
  }

  public getRelatedEntities(canonicalCode: string, predicate?: string): RelatedEntityConnection[] {
    return getRelatedEntitiesFromDb(canonicalCode, predicate);
  }

  public getGraphNode(canonicalCode: string): any | null {
    return getGraphNodeByCode(canonicalCode);
  }

  public getSiblingsByCategory(term: string, limit: number = 8): string[] {
    return getSiblingsByCategoryFromDb(term, limit);
  }
}

export function getSiblingsByCategoryFromDb(term: string, limit: number = 8): string[] {
  if (!term || typeof term !== 'string') return [];
  const norm = normalizeText(term);
  if (!norm) return [];

  try {
    const db = getTerminologyDb();
    if (!db) return [];

    // 1. Achar a categoria e canonical_term do termo buscado
    const row = db
      .prepare<[string], { category: string | null; canonical_term: string | null }>(
        'SELECT category, canonical_term FROM terms WHERE normalized_term = ? LIMIT 1'
      )
      .get(norm);

    if (!row || !row.category) return [];

    const targetCategory = row.category;
    const targetCanonical = row.canonical_term || norm;

    // 2. Buscar outros termos da MESMA categoria, excluindo o próprio termo
    const rows = db
      .prepare<[string, string, string, number], { sibling: string }>(
        `SELECT DISTINCT COALESCE(canonical_term, term) AS sibling 
         FROM terms 
         WHERE category = ? 
           AND normalized_term != ? 
           AND COALESCE(canonical_term, '') != ?
         LIMIT ?`
      )
      .all(targetCategory, norm, targetCanonical, limit);

    return rows
      .map((r) => r.sibling)
      .filter((s) => Boolean(s) && normalizeText(s) !== norm && normalizeText(s) !== normalizeText(targetCanonical));
  } catch (err) {
    console.warn('[DictionaryNEREngine] Erro em getSiblingsByCategory:', err);
    return [];
  }
}

export const dictionaryNEREngine = new DictionaryNEREngine();


/**
 * Limiar mínimo de cobertura de caracteres reconhecidos (3% do texto).
 * Chunks com cobertura menor que este valor acionam fallback para a API de IA.
 */
export const MIN_COVERAGE_THRESHOLD = 0.03;

/**
 * Função pura para estimar a proporção de caracteres cobertos por entidades médicas reconhecidas sobre o total do texto.
 */
export function estimateCoverage(text: string, entities: MatchedEntity[]): number {
  if (!text || text.trim().length === 0) return 0;
  if (!entities || entities.length === 0) return 0;

  const totalRecognizedChars = entities.reduce((sum, ent) => sum + (ent.endIndex - ent.startIndex), 0);
  return totalRecognizedChars / text.length;
}
