import terminology from './medicalTerminologyPt.json';
import { AhoCorasick } from './ahoCorasick';

export interface MatchedEntity {
  text: string;           // trecho exato encontrado no texto original
  normalizedTerm: string; // termo canônico do dicionário
  category: string;
  startIndex: number;
  endIndex: number;
}

export interface ExtractedRelation {
  sourceEntity: string;
  targetEntity: string;
  relationType: string;
  triggerPhrase: string;
  sentence: string;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // remove acentos
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

  // MECANISMO_DE_ACAO (novo)
  { pattern: /\bage(m)? (sobre|em|no|na)\b|\batua(m)? (sobre|em|no|na)\b/, type: 'MECANISMO_DE_ACAO' },
  { pattern: /\binibe(m)?\b/, type: 'MECANISMO_DE_ACAO' },
  { pattern: /\bestimula(m)?\b/, type: 'MECANISMO_DE_ACAO' },
  { pattern: /\bbloqueia(m)?\b/, type: 'MECANISMO_DE_ACAO' },
  { pattern: /\bativa(m)?\b/, type: 'MECANISMO_DE_ACAO' },
  { pattern: /\breduz(em)?\b/, type: 'MECANISMO_DE_ACAO' },
  { pattern: /\baumenta(m)? a (produção|secreção|liberação) de\b/, type: 'MECANISMO_DE_ACAO' },

  // EFEITO_ADVERSO (novo)
  { pattern: /\befeito(s)? colateral(is)? (de|do|da)\b/, type: 'EFEITO_ADVERSO' },
  { pattern: /\befeito(s)? adverso(s)? (de|do|da)\b/, type: 'EFEITO_ADVERSO' },
  { pattern: /\bpode(m)? causar como efeito colateral\b/, type: 'EFEITO_ADVERSO' },
  { pattern: /\breação(ões)? adversa(s)? (a|ao|à)\b/, type: 'EFEITO_ADVERSO' },

  // PREVENCAO (novo)
  { pattern: /\bprevine(m)?\b/, type: 'PREVENCAO' },
  { pattern: /\breduz(em)? o risco de\b/, type: 'PREVENCAO' },
  { pattern: /\bprofilaxia (para|de|do|da)\b/, type: 'PREVENCAO' },
];

export class DictionaryNEREngine {
  private automaton: AhoCorasick<{ canonicalTerm: string; category: string }>;

  constructor() {
    this.automaton = new AhoCorasick<{ canonicalTerm: string; category: string }>();

    for (const entry of terminology as any[]) {
      this.automaton.add(normalizeText(entry.term), { canonicalTerm: entry.term, category: entry.category });
      for (const syn of entry.synonyms || []) {
        this.automaton.add(normalizeText(syn), { canonicalTerm: entry.term, category: entry.category });
      }
    }

    this.automaton.build();
  }

  extractEntities(text: string): MatchedEntity[] {
    const normalizedFullText = normalizeText(text);
    const rawMatches = this.automaton.search(normalizedFullText);

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
      const { startIndex, endIndex, value } = match;

      // Verifica limites de palavra (evita casar "card" dentro de outra palavra)
      const before = startIndex === 0 ? ' ' : normalizedFullText[startIndex - 1];
      const after = endIndex >= normalizedFullText.length ? ' ' : normalizedFullText[endIndex];
      const isWordBoundary = /[^a-z0-9]/.test(before) && /[^a-z0-9]/.test(after);
      if (!isWordBoundary) continue;

      // Verifica se essa região do texto já foi ocupada por um termo maior já casado
      let alreadyOccupied = false;
      for (let i = startIndex; i < endIndex; i++) {
        if (occupied[i]) { alreadyOccupied = true; break; }
      }
      if (alreadyOccupied) continue;

      for (let i = startIndex; i < endIndex; i++) occupied[i] = true;

      entities.push({
        text: text.slice(startIndex, endIndex),
        normalizedTerm: value.canonicalTerm,
        category: value.category,
        startIndex,
        endIndex,
      });
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

