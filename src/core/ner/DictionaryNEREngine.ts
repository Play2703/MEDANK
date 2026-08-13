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

export interface TermRow {
  system: string | null;
  code: string | null;
  category?: string | null;
  canonical_term?: string | null;
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

export function getTerminologyDb(): Database.Database | null {
  if (dbInstance) return dbInstance;
  try {
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      const dbPath = getDbPath();
      if (fs.existsSync(dbPath)) {
        dbInstance = new Database(dbPath, { readonly: true, fileMustExist: true });
        return dbInstance;
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
    selectTermStmt = db.prepare<[string], TermRow>(
      'SELECT system, code, category, canonical_term FROM terms WHERE term = ? LIMIT 1'
    );
  }
  return selectTermStmt;
}

export function lookupTerm(term: string): TermRow | undefined {
  const stmt = getSelectTermStatement();
  if (!stmt) return undefined;
  const norm = normalizeText(term);
  const row = stmt.get(norm);
  if (row) return row;
  const trimmed = term.trim();
  if (trimmed !== norm) {
    return stmt.get(trimmed);
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
  constructor() {
    // Garante inicialização prévia da conexão e do prepared statement
    getSelectTermStatement();
  }

  public reload(): void {
    if (dbInstance) {
      try {
        dbInstance.close();
      } catch {}
      dbInstance = null;
    }
    selectTermStmt = null;
    getSelectTermStatement();
  }

  extractEntities(text: string): MatchedEntity[] {
    if (!text || typeof text !== 'string' || !text.trim()) {
      return [];
    }

    const tokens = tokenize(text);
    if (tokens.length === 0) {
      return [];
    }

    const rawMatches: MatchedEntity[] = [];
    const maxSpanLength = 8;

    for (let i = 0; i < tokens.length; i++) {
      const maxLen = Math.min(tokens.length - i, maxSpanLength);
      for (let len = maxLen; len >= 1; len--) {
        const startIdx = tokens[i].startIndex;
        const endIdx = tokens[i + len - 1].endIndex;
        const rawText = text.slice(startIdx, endIdx);
        const row = lookupTerm(rawText);

        if (row) {
          rawMatches.push({
            text: rawText,
            normalizedTerm: row.canonical_term || rawText,
            category: row.category || 'DOENCA',
            startIndex: startIdx,
            endIndex: endIdx,
            codeSystem: row.system ?? null,
            code: row.code ?? null,
          });
        }
      }
    }

    // Ordena os matches brutos por tamanho decrescente (e por posição em caso de empate)
    // para garantir que termos maiores tenham prioridade de marcação em 'occupied'
    rawMatches.sort((a, b) => {
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
