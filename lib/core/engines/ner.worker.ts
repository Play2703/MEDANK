/**
 * Medical Named Entity Recognition (NER) Web Worker
 * Runs DictionaryNEREngine & Clinical Relations extraction in a background thread
 * to guarantee smooth 60fps UI performance without main thread blocking.
 */

export interface MatchedEntity {
  text: string;
  normalizedTerm: string;
  category: string;
  startIndex: number;
  endIndex: number;
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

export interface NERAnalysisResult {
  text: string;
  entities: MatchedEntity[];
  relations: ExtractedRelation[];
  coverage: number;
}

export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

export type NERWorkerRequest =
  | { id: string; type: 'INIT'; payload?: { customTerms?: Array<{ term: string; category: string; codeSystem?: string; code?: string }> } }
  | { id: string; type: 'EXTRACT_ENTITIES'; text: string }
  | { id: string; type: 'EXTRACT_RELATIONS'; text: string; entities: MatchedEntity[] }
  | { id: string; type: 'ANALYZE_TEXT'; text: string };

export type NERWorkerRequestInput = DistributiveOmit<NERWorkerRequest, 'id'>;


export type NERWorkerResponse =
  | { id: string; type: 'INIT_SUCCESS' }
  | { id: string; type: 'EXTRACT_ENTITIES_SUCCESS'; entities: MatchedEntity[] }
  | { id: string; type: 'EXTRACT_RELATIONS_SUCCESS'; relations: ExtractedRelation[] }
  | { id: string; type: 'ANALYZE_TEXT_SUCCESS'; result: NERAnalysisResult }
  | { id: string; type: 'ERROR'; error: string };

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function estimateCoverage(text: string, entities: MatchedEntity[]): number {
  if (!text || text.trim().length === 0) return 0;
  if (!entities || entities.length === 0) return 0;
  const totalRecognizedChars = entities.reduce((sum, ent) => sum + (ent.endIndex - ent.startIndex), 0);
  return totalRecognizedChars / text.length;
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

export interface TermEntry {
  canonicalTerm: string;
  category: string;
  codeSystem?: string | null;
  code?: string | null;
}

export class WorkerNEREngine {
  private termMap: Map<string, TermEntry> = new Map();

  constructor() {
    this.initDefaultCoreTerms();
  }

  public registerTerm(term: string, entry: TermEntry): void {
    const norm = normalizeText(term);
    this.termMap.set(norm, entry);
    const rawTrimmed = term.trim().toLowerCase();
    if (rawTrimmed !== norm) {
      this.termMap.set(rawTrimmed, entry);
    }
  }

  public loadTerms(terms: Array<{ term: string; category: string; codeSystem?: string; code?: string }>): void {
    for (const item of terms) {
      this.registerTerm(item.term, {
        canonicalTerm: item.term,
        category: item.category || 'DOENCA',
        codeSystem: item.codeSystem || null,
        code: item.code || null,
      });
    }
  }

  private initDefaultCoreTerms(): void {
    // Termos médicos essenciais de alta frequência para inicialização imediata
    const baseTerms: Array<{ term: string; category: string; codeSystem?: string; code?: string }> = [
      { term: 'infarto agudo do miocárdio', category: 'DOENCA', codeSystem: 'CID-10', code: 'I21' },
      { term: 'iam', category: 'DOENCA', codeSystem: 'CID-10', code: 'I21' },
      { term: 'hipertensão arterial sistêmica', category: 'DOENCA', codeSystem: 'CID-10', code: 'I10' },
      { term: 'has', category: 'DOENCA', codeSystem: 'CID-10', code: 'I10' },
      { term: 'diabetes mellitus', category: 'DOENCA', codeSystem: 'CID-10', code: 'E14' },
      { term: 'diabetes', category: 'DOENCA', codeSystem: 'CID-10', code: 'E14' },
      { term: 'asma', category: 'DOENCA', codeSystem: 'CID-10', code: 'J45' },
      { term: 'pneumonia', category: 'DOENCA', codeSystem: 'CID-10', code: 'J18' },
      { term: 'insuficiência cardíaca', category: 'DOENCA', codeSystem: 'CID-10', code: 'I50' },
      { term: 'insuficiência renal aguda', category: 'DOENCA', codeSystem: 'CID-10', code: 'N17' },
      { term: 'acidente vascular cerebral', category: 'DOENCA', codeSystem: 'CID-10', code: 'I64' },
      { term: 'avc', category: 'DOENCA', codeSystem: 'CID-10', code: 'I64' },
      { term: 'fibrilação atrial', category: 'DOENCA', codeSystem: 'CID-10', code: 'I48' },
      { term: 'choque cardiogênico', category: 'DOENCA', codeSystem: 'CID-10', code: 'R57.0' },
      { term: 'sepse', category: 'DOENCA', codeSystem: 'CID-10', code: 'A41.9' },
      { term: 'apendicite aguda', category: 'DOENCA', codeSystem: 'CID-10', code: 'K35' },
      { term: 'colecistite', category: 'DOENCA', codeSystem: 'CID-10', code: 'K81' },
      { term: 'tuberculose', category: 'DOENCA', codeSystem: 'CID-10', code: 'A15' },
      { term: 'choque séptico', category: 'DOENCA', codeSystem: 'CID-10', code: 'R57.2' },
      { term: 'embolia pulmonar', category: 'DOENCA', codeSystem: 'CID-10', code: 'I26' },
      { term: 'tep', category: 'DOENCA', codeSystem: 'CID-10', code: 'I26' },

      // SINTOMAS
      { term: 'dor torácica', category: 'SINTOMA', codeSystem: 'CID-10', code: 'R07.4' },
      { term: 'dispneia', category: 'SINTOMA', codeSystem: 'CID-10', code: 'R06.0' },
      { term: 'falta de ar', category: 'SINTOMA', codeSystem: 'CID-10', code: 'R06.0' },
      { term: 'febre', category: 'SINTOMA', codeSystem: 'CID-10', code: 'R50.9' },
      { term: 'tosse', category: 'SINTOMA', codeSystem: 'CID-10', code: 'R05' },
      { term: 'taquicardia', category: 'SINTOMA', codeSystem: 'CID-10', code: 'R00.0' },
      { term: 'hipotensão', category: 'SINTOMA', codeSystem: 'CID-10', code: 'I95.9' },
      { term: 'cefaleia', category: 'SINTOMA', codeSystem: 'CID-10', code: 'R51' },
      { term: 'síncope', category: 'SINTOMA', codeSystem: 'CID-10', code: 'R55' },
      { term: 'edema', category: 'SINTOMA', codeSystem: 'CID-10', code: 'R60.9' },
      { term: 'cianose', category: 'SINTOMA', codeSystem: 'CID-10', code: 'R23.0' },
      { term: 'icterícia', category: 'SINTOMA', codeSystem: 'CID-10', code: 'R17' },
      { term: 'hemoptise', category: 'SINTOMA', codeSystem: 'CID-10', code: 'R04.2' },

      // FARMACOS
      { term: 'aspirina', category: 'FARMACO', codeSystem: 'DeCS', code: 'D001241' },
      { term: 'ácido acetilsalicílico', category: 'FARMACO', codeSystem: 'DeCS', code: 'D001241' },
      { term: 'aas', category: 'FARMACO', codeSystem: 'DeCS', code: 'D001241' },
      { term: 'metformina', category: 'FARMACO', codeSystem: 'DeCS', code: 'D008687' },
      { term: 'captopril', category: 'FARMACO', codeSystem: 'DeCS', code: 'D002211' },
      { term: 'enalapril', category: 'FARMACO', codeSystem: 'DeCS', code: 'D004656' },
      { term: 'losartana', category: 'FARMACO', codeSystem: 'DeCS', code: 'D019808' },
      { term: 'amiodarona', category: 'FARMACO', codeSystem: 'DeCS', code: 'D000638' },
      { term: 'furosemida', category: 'FARMACO', codeSystem: 'DeCS', code: 'D005665' },
      { term: 'morfina', category: 'FARMACO', codeSystem: 'DeCS', code: 'D009020' },
      { term: 'atorvastatina', category: 'FARMACO', codeSystem: 'DeCS', code: 'D000069059' },
      { term: 'clopidogrel', category: 'FARMACO', codeSystem: 'DeCS', code: 'D000077144' },
      { term: 'ceftriaxona', category: 'FARMACO', codeSystem: 'DeCS', code: 'D002443' },
      { term: 'azitromicina', category: 'FARMACO', codeSystem: 'DeCS', code: 'D017964' },
      { term: 'adrenalina', category: 'FARMACO', codeSystem: 'DeCS', code: 'D004837' },
      { term: 'noradrenalina', category: 'FARMACO', codeSystem: 'DeCS', code: 'D009638' },
      { term: 'alopurinol', category: 'FARMACO', codeSystem: 'DeCS', code: 'D000493' },

      // EXAMES & PROCEDIMENTOS
      { term: 'eletrocardiograma', category: 'EXAME', codeSystem: 'DeCS', code: 'D004562' },
      { term: 'ecg', category: 'EXAME', codeSystem: 'DeCS', code: 'D004562' },
      { term: 'radiografia de tórax', category: 'EXAME', codeSystem: 'DeCS', code: 'D013902' },
      { term: 'tomografia computadorizada', category: 'EXAME', codeSystem: 'DeCS', code: 'D014057' },
      { term: 'angiotomografia', category: 'EXAME', codeSystem: 'DeCS', code: 'D000072226' },
      { term: 'troponina', category: 'EXAME', codeSystem: 'DeCS', code: 'D014336' },
      { term: 'hemograma', category: 'EXAME', codeSystem: 'DeCS', code: 'D001772' },
      { term: 'ecocardiograma', category: 'EXAME', codeSystem: 'DeCS', code: 'D004452' },
      { term: 'gasometria arterial', category: 'EXAME', codeSystem: 'DeCS', code: 'D001774' },

      // ANATOMIA
      { term: 'miocárdio', category: 'ANATOMIA', codeSystem: 'DeCS', code: 'D009206' },
      { term: 'artéria coronária', category: 'ANATOMIA', codeSystem: 'DeCS', code: 'D003331' },
      { term: 'ventrículo esquerdo', category: 'ANATOMIA', codeSystem: 'DeCS', code: 'D006352' },
      { term: 'pulmão', category: 'ANATOMIA', codeSystem: 'DeCS', code: 'D008168' },
      { term: 'átrio esquerdo', category: 'ANATOMIA', codeSystem: 'DeCS', code: 'D006325' },
    ];

    this.loadTerms(baseTerms);
  }

  public lookupTerm(term: string): TermEntry | undefined {
    const norm = normalizeText(term);
    return this.termMap.get(norm) || this.termMap.get(term.trim().toLowerCase());
  }

  public extractEntities(text: string): MatchedEntity[] {
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
        const row = this.lookupTerm(rawText);

        if (row) {
          rawMatches.push({
            text: rawText,
            normalizedTerm: row.canonicalTerm || rawText,
            category: row.category || 'DOENCA',
            startIndex: startIdx,
            endIndex: endIdx,
            codeSystem: row.codeSystem ?? null,
            code: row.code ?? null,
          });
        }
      }
    }

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

  public extractRelations(text: string, entities: MatchedEntity[]): ExtractedRelation[] {
    const relations: ExtractedRelation[] = [];
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

  public analyzeText(text: string): NERAnalysisResult {
    const entities = this.extractEntities(text);
    const relations = this.extractRelations(text, entities);
    const coverage = estimateCoverage(text, entities);
    return {
      text,
      entities,
      relations,
      coverage,
    };
  }
}

// Singleton instance inside Worker
const engine = new WorkerNEREngine();

// Handle messages if executed in a Web Worker environment
if (typeof self !== 'undefined' && 'postMessage' in self && typeof (self as any).importScripts === 'function') {
  self.onmessage = (event: MessageEvent<NERWorkerRequest>) => {
    const req = event.data;
    if (!req || !req.id) return;

    try {
      switch (req.type) {
        case 'INIT': {
          if (req.payload?.customTerms) {
            engine.loadTerms(req.payload.customTerms);
          }
          const response: NERWorkerResponse = { id: req.id, type: 'INIT_SUCCESS' };
          self.postMessage(response);
          break;
        }
        case 'EXTRACT_ENTITIES': {
          const entities = engine.extractEntities(req.text);
          const response: NERWorkerResponse = { id: req.id, type: 'EXTRACT_ENTITIES_SUCCESS', entities };
          self.postMessage(response);
          break;
        }
        case 'EXTRACT_RELATIONS': {
          const relations = engine.extractRelations(req.text, req.entities);
          const response: NERWorkerResponse = { id: req.id, type: 'EXTRACT_RELATIONS_SUCCESS', relations };
          self.postMessage(response);
          break;
        }
        case 'ANALYZE_TEXT': {
          const result = engine.analyzeText(req.text);
          const response: NERWorkerResponse = { id: req.id, type: 'ANALYZE_TEXT_SUCCESS', result };
          self.postMessage(response);
          break;
        }
        default: {
          const reqId = (req as any).id || 'unknown';
          const response: NERWorkerResponse = { id: reqId, type: 'ERROR', error: 'Unknown request type' };
          self.postMessage(response);
        }
      }
    } catch (err: any) {
      const reqId = (req as any)?.id || 'unknown';
      const response: NERWorkerResponse = { id: reqId, type: 'ERROR', error: err?.message || 'Worker processing error' };
      self.postMessage(response);
    }
  };
}

