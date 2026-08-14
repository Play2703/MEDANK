import { db } from '../../db/database';
import { MedicalEntityType, RelationType } from '../../../domain/entities/ChunkEntity';
import { CONFUSION_SETS, ConfusionSet } from './confusionSets';
import { cosineSimilarity } from '../cosineSimilarity';
import { localEmbeddingClient } from '../embeddings/LocalEmbeddingClient';
import { entityEmbeddingIndexer } from './EntityEmbeddingIndexer';

export interface DistractorCandidate {
  text: string;
  entityType?: MedicalEntityType;
  source: 'grafo' | 'banco_estatico' | 'semantico';
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
   * Fonte 3 (semântica): busca entidades do MESMO tipo (`entityType`) cujo embedding tem
   * similaridade de cosseno alta com o embedding da resposta correta, mas que não são
   * sinônimos/variações exatas dela (para evitar sugerir a própria resposta como distrator).
   */
  async getSemanticCandidates(
    correctAnswerText: string,
    correctEntityType?: MedicalEntityType,
    limit: number = 10
  ): Promise<DistractorCandidate[]> {
    if (!correctAnswerText) return [];

    try {
      const [correctEmbedding] = await localEmbeddingClient.generateEmbeddings([correctAnswerText]);
      if (!correctEmbedding) return [];

      // Busca candidatas do mesmo tipo de entidade no índice canônico, priorizando as mais frequentes
      let candidateRecords = correctEntityType
        ? await db.canonicalEntityIndex.where('type').equals(correctEntityType).toArray()
        : await db.canonicalEntityIndex.toArray();

      // Limita a até 200 candidatas para performance sustentável
      if (candidateRecords.length > 200) {
        candidateRecords = candidateRecords
          .sort((a, b) => (b.occurrenceCount || 0) - (a.occurrenceCount || 0))
          .slice(0, 200);
      }

      if (candidateRecords.length === 0) return [];

      // Garante embeddings pras entidades candidatas (gera só as que faltam em lote)
      await entityEmbeddingIndexer.ensureEmbeddingsForEntities(
        candidateRecords.map((e) => ({ canonicalKey: e.canonicalKey, displayText: e.displayText }))
      );

      const normCorrect = normalizeStr(correctAnswerText);
      const scored: { entity: (typeof candidateRecords)[number]; score: number }[] = [];

      for (const entity of candidateRecords) {
        if (normalizeStr(entity.displayText) === normCorrect) continue; // exclui a própria resposta

        const record = await db.entityEmbeddings.get(entity.canonicalKey);
        if (!record || !record.embedding) continue;

        const score = cosineSimilarity(correctEmbedding, record.embedding);
        // Faixa de similaridade "relacionado mas diferente": nem idêntico (>0.95, provável sinônimo
        // da própria resposta), nem irrelevante (<0.5).
        if (score >= 0.5 && score <= 0.95) {
          scored.push({ entity, score });
        }
      }

      scored.sort((a, b) => b.score - a.score);

      return scored.slice(0, limit).map(({ entity, score }) => ({
        text: entity.displayText,
        entityType: entity.type,
        source: 'semantico' as const,
        rationale: `Similaridade semântica de ${(score * 100).toFixed(0)}% com a resposta correta`,
      }));
    } catch (err) {
      console.warn('[DistractorEngine] Error fetching semantic candidates:', err);
      return [];
    }
  }

  /**
   * Combina as três fontes (Grafo relacional de conhecimento, Confusion Sets estáticos e Busca Semântica),
   * deduplica (case-insensitive por `text`), prioriza na ordem:
   * grafo > banco_estatico > semantico
   * e limita ao número solicitado (default 8).
   *
   * Suporta consultas baseadas em topicCanonicalKeys (múltiplas chaves canônicas de contexto)
   * e/ou correctAnswerText (resposta correta da questão).
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

    // 3. Complementa com busca semântica por embedding local se ainda houver espaço
    if (resultMap.size < limit && correctAnswerText) {
      try {
        const semanticCandidates = await this.getSemanticCandidates(
          correctAnswerText,
          entityType,
          limit
        );
        for (const item of semanticCandidates) {
          const normText = normalizeStr(item.text);
          if (normCorrect && normText === normCorrect) continue;
          if (!resultMap.has(normText)) {
            resultMap.set(normText, item);
          }
        }
      } catch (err) {
        console.warn('[DistractorEngine] Semantic candidate lookup failed:', err);
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
