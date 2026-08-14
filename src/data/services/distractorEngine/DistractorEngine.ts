import { db } from '../../db/database';
import { MedicalEntityType, RelationType } from '../../../domain/entities/ChunkEntity';
import { CONFUSION_SETS, ConfusionSet } from './confusionSets';

export interface DistractorCandidate {
  text: string;
  entityType?: MedicalEntityType;
  source: 'grafo' | 'banco_estatico';
  rationale?: string;
}

export interface DistractorCandidateOptions {
  /**
   * Chave canônica de uma resposta correta conhecida (opcional, para cenários com gabarito já existente)
   */
  correctEntityCanonicalKey?: string;
  /**
   * Lista de chaves canônicas de entidades extraídas dos chunks de contexto/tópico
   */
  topicCanonicalKeys?: string[];
  correctAnswerText?: string;
  entityType?: MedicalEntityType;
  specialty: string;
  topics: string[];
  limit?: number;
}

function normalizeStr(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export class DistractorEngine {
  /**
   * Fonte 1 (dinâmica): busca em db.graphEdges (usando o índice 'objectCanonicalKey')
   * outras entidades do MESMO tipo conectadas ao mesmo objeto/contexto por um
   * predicado clínico relevante ('trata', 'indica', 'classifica_como', 'associado_a', 'causa'),
   * via db.canonicalEntityIndex pra filtrar por type e pegar o displayText.
   * Excluir a própria correctEntityCanonicalKey.
   */
  async getGraphCandidates(
    correctEntityCanonicalKey: string,
    correctEntityType?: MedicalEntityType,
    relevantPredicates: RelationType[] = ['trata', 'indica', 'classifica_como', 'associado_a', 'causa']
  ): Promise<DistractorCandidate[]> {
    if (!correctEntityCanonicalKey) return [];

    try {
      const candidateSubjectKeys = new Set<string>();

      // Outgoing edges from correctEntityCanonicalKey to find connected objects
      const outgoingEdges = await db.graphEdges
        .where('subjectCanonicalKey')
        .equals(correctEntityCanonicalKey)
        .toArray();

      const objectKeys = Array.from(new Set(outgoingEdges.map((e) => e.objectCanonicalKey)));

      // For each connected object, query db.graphEdges by objectCanonicalKey
      for (const objKey of objectKeys) {
        const edges = await db.graphEdges
          .where('objectCanonicalKey')
          .equals(objKey)
          .toArray();

        for (const edge of edges) {
          if (
            edge.subjectCanonicalKey !== correctEntityCanonicalKey &&
            (!relevantPredicates.length || relevantPredicates.includes(edge.predicate))
          ) {
            candidateSubjectKeys.add(edge.subjectCanonicalKey);
          }
        }
      }

      // Also check incoming edges where objectCanonicalKey === correctEntityCanonicalKey
      const incomingEdges = await db.graphEdges
        .where('objectCanonicalKey')
        .equals(correctEntityCanonicalKey)
        .toArray();

      for (const edge of incomingEdges) {
        if (
          edge.subjectCanonicalKey !== correctEntityCanonicalKey &&
          (!relevantPredicates.length || relevantPredicates.includes(edge.predicate))
        ) {
          candidateSubjectKeys.add(edge.subjectCanonicalKey);
        }
      }

      const candidates: DistractorCandidate[] = [];

      for (const key of candidateSubjectKeys) {
        const indexRecord = await db.canonicalEntityIndex.get(key);
        if (indexRecord) {
          if (!correctEntityType || indexRecord.type === correctEntityType) {
            candidates.push({
              text: indexRecord.displayText || key,
              entityType: indexRecord.type,
              source: 'grafo',
              rationale: 'Relacionado no grafo de conhecimento via contexto comum',
            });
          }
        } else {
          candidates.push({
            text: key,
            entityType: correctEntityType,
            source: 'grafo',
            rationale: 'Relacionado no grafo de conhecimento',
          });
        }
      }

      return candidates;
    } catch (err) {
      console.warn('[DistractorEngine] Error fetching graph candidates:', err);
      return [];
    }
  }

  /**
   * Fonte 2 (estática): dado o texto da resposta correta + specialty + topics,
   * faz matching (normalizando acento/caixa) do `specialty` E/OU `context`
   * contra CONFUSION_SETS, retorna os `members` dos sets que bateram, excluindo
   * a própria resposta correta (comparação case-insensitive).
   */
  getStaticCandidates(
    correctAnswerText: string,
    specialty: string,
    topics: string[] = []
  ): DistractorCandidate[] {
    const normCorrect = normalizeStr(correctAnswerText || '');
    const normSpecialty = normalizeStr(specialty || '');
    const normTopics = (topics || []).map((t) => normalizeStr(t));

    const matchedSets: ConfusionSet[] = [];

    for (const set of CONFUSION_SETS) {
      const normSetSpecialty = normalizeStr(set.specialty);
      const isSpecialtyMatch =
        normSetSpecialty === normSpecialty ||
        normSpecialty.includes(normSetSpecialty) ||
        normSetSpecialty.includes(normSpecialty);

      const isContextMatch = set.context.some((ctx) => {
        const normCtx = normalizeStr(ctx);
        if (normSpecialty.includes(normCtx)) return true;
        return normTopics.some((top) => top.includes(normCtx) || normCtx.includes(top));
      });

      const isMemberMatch = normCorrect
        ? set.members.some((m) => normalizeStr(m) === normCorrect)
        : false;

      if (isSpecialtyMatch || isContextMatch || isMemberMatch) {
        matchedSets.push(set);
      }
    }

    const candidateMap = new Map<string, DistractorCandidate>();

    for (const set of matchedSets) {
      for (const member of set.members) {
        const normMember = normalizeStr(member);

        // Exclude correct answer
        if (normCorrect && normMember === normCorrect) {
          continue;
        }

        if (!candidateMap.has(normMember)) {
          candidateMap.set(normMember, {
            text: member,
            entityType: set.entityType,
            source: 'banco_estatico',
            rationale: set.rationale,
          });
        }
      }
    }

    return Array.from(candidateMap.values());
  }

  /**
   * Combina as duas fontes (Grafo relacional de conhecimento e Confusion Sets estáticos),
   * deduplica (case-insensitive por `text`), prioriza 'grafo' sobre 'banco_estatico' em caso
   * de duplicata e limita ao número solicitado (default 8).
   *
   * Suporta consultas baseadas em topicCanonicalKeys (múltiplas chaves canônicas de contexto)
   * e/ou correctEntityCanonicalKey (chave única de gabarito pré-existente).
   */
  async getCandidates(params: DistractorCandidateOptions): Promise<DistractorCandidate[]> {
    const {
      correctEntityCanonicalKey,
      topicCanonicalKeys = [],
      correctAnswerText = '',
      entityType,
      specialty,
      topics = [],
      limit = 8,
    } = params;

    // Coleta até 5 chaves canônicas únicas para buscar no grafo sem sobrecarregar o IndexedDB
    const keysToSearch = Array.from(
      new Set(
        [
          correctEntityCanonicalKey,
          ...(topicCanonicalKeys || []),
        ].filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
      )
    ).slice(0, 5);

    const graphCandidates: DistractorCandidate[] = [];
    for (const key of keysToSearch) {
      try {
        const candidatesForKey = await this.getGraphCandidates(key, entityType);
        graphCandidates.push(...candidatesForKey);
      } catch (err) {
        console.warn(`[DistractorEngine] Error fetching graph candidates for key "${key}":`, err);
      }
    }

    const staticCandidates = this.getStaticCandidates(
      correctAnswerText,
      specialty,
      topics
    );

    const normCorrect = normalizeStr(correctAnswerText);
    const resultMap = new Map<string, DistractorCandidate>();

    // 1. Prioriza candidatos dinâmicos do grafo relacional
    for (const item of graphCandidates) {
      const normText = normalizeStr(item.text);
      if (normCorrect && normText === normCorrect) continue;
      if (!resultMap.has(normText)) {
        resultMap.set(normText, item);
      }
    }

    // 2. Complementa com candidatos estáticos dos confusion sets
    for (const item of staticCandidates) {
      const normText = normalizeStr(item.text);
      if (normCorrect && normText === normCorrect) continue;
      if (!resultMap.has(normText)) {
        resultMap.set(normText, item);
      }
    }

    const resultList = Array.from(resultMap.values());

    return resultList.slice(0, limit);
  }

  /**
   * Alias semântico para obtenção de distratores ancorados no contexto temático
   */
  async getCandidatesForTopic(params: DistractorCandidateOptions): Promise<DistractorCandidate[]> {
    return this.getCandidates(params);
  }
}

export const distractorEngine = new DistractorEngine();
