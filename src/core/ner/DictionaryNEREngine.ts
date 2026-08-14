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

import { levenshteinDistance } from './levenshtein';

export interface TermRow {
  system: string | null;
  code: string | null;
  category?: string | null;
  canonical_term?: string | null;
  normalized_term?: string | null;
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
    path.resolve(__dirname, 'medicalTerminology.db'),
  ];
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


const COMMON_STOP_WORDS = new Set([
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
];

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

  constructor() {
    // Construtor totalmente desacoplado de I/O síncrono no boot
  }

  /**
   * Inicialização e aquecimento assíncrono do motor terminológico.
   * Pode ser disparado em background pós-listen do servidor ou aguardado sob demanda.
   */
  public async warmup(): Promise<boolean> {
    if (this.isWarmedUp) return true;
    if (warmupPromise) return warmupPromise;

    warmupPromise = (async () => {
      const start = Date.now();
      console.log('[DictionaryNEREngine] Iniciando warmup do motor terminológico...');
      try {
        const db = getTerminologyDb();
        if (db) {
          getSelectTermStatement();
          getSelectLikeStatement();

          // Query de validação e aquecimento do cache
          const countRow = db.prepare('SELECT COUNT(*) as count FROM terms').get() as { count: number };
          const testLookup = lookupTerm('hipertensao', false);

          const elapsed = Date.now() - start;
          console.log(
            `[DictionaryNEREngine] Warmup concluído com sucesso em ${elapsed}ms (${countRow?.count ?? 0} termos indexados). Termo de teste: "${testLookup?.canonical_term ?? 'ok'}"`
          );
          this.isWarmedUp = true;
          return true;
        } else {
          console.warn('[DictionaryNEREngine] Warmup falhou: SQLite database não disponível.');
          return false;
        }
      } catch (err) {
        console.warn('[DictionaryNEREngine] Erro durante warmup:', err);
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
    this.isWarmedUp = false;
    warmupPromise = null;
  }


  extractEntities(text: string): MatchedEntity[] {
    if (!text || typeof text !== 'string' || !text.trim()) {
      return [];
    }

    const tokens = tokenize(text);
    if (tokens.length === 0) {
      return [];
    }

    const rawMatches: Array<MatchedEntity & { isExact: boolean }> = [];
    const maxSpanLength = 8;

    for (let i = 0; i < tokens.length; i++) {
      const maxLen = Math.min(tokens.length - i, maxSpanLength);
      for (let len = maxLen; len >= 1; len--) {
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
          });
        }
      }
    }

    // Prioriza matches exatos sobre aproximações e depois termos mais longos
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
      entities.push(match);
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
          for (const target of targetEntities) {
            if (source.normalizedTerm === target.normalizedTerm) continue;

            relations.push({
              sourceEntity: source.normalizedTerm,
              targetEntity: target.normalizedTerm,
              relationType: trig.type,
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
