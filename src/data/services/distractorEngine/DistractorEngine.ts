import { db } from '../../db/database';
import { MedicalEntityType, RelationType } from '../../../domain/entities/ChunkEntity';
import { CONFUSION_SETS, ConfusionSet } from './confusionSets';
import { cosineSimilarity } from '../cosineSimilarity';
import { localEmbeddingClient } from '../embeddings/LocalEmbeddingClient';
import { entityEmbeddingIndexer } from './EntityEmbeddingIndexer';
import { apiUrl } from '../../../lib/apiBaseUrl';
import { isValidOptionText } from '../../../core/utils/contentValidation';

export interface DistractorCandidate {
  text: string;
  entityType?: MedicalEntityType;
  source: 'extracted_exam' | 'grafo' | 'banco_estatico' | 'semantico' | 'decs';
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
   */
  async getGraphCandidates(
    correctEntityCanonicalKey?: string,
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
        const displayText = indexRecord?.displayText;
        if (displayText && isValidOptionText(displayText)) {
          if (!correctEntityType || indexRecord?.type === correctEntityType) {
            candidates.push({
              text: displayText,
              entityType: indexRecord?.type,
              source: 'grafo',
              rationale: 'Relacionado no grafo de conhecimento via contexto comum',
            });
          }
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
   * faz matching contra CONFUSION_SETS.
   *
   * REGRA DE MATCHING:
   * - isSpecialtyMatch sozinho NÃO inclui o set.
   * - Um set só é selecionado se (isContextMatch === true) OU (isMemberMatch === true).
   * - isSpecialtyMatch atua como pré-filtro para a checagem de contexto.
   * - Se nenhum set bater, retorna array vazio (sem forçar candidatos estáticos irrelevantes).
   */
  getStaticCandidates(
    correctAnswerText: string,
    specialty: string,
    topics: string[] = []
  ): DistractorCandidate[] {
    const normCorrect = normalizeStr(correctAnswerText || '');
    const normSpecialty = normalizeStr(specialty || '');
    const normTopics = (topics || [])
      .map((t) => normalizeStr(t))
      .filter((t) => t.length > 0);

    const matchedSets: ConfusionSet[] = [];

    for (const set of CONFUSION_SETS) {
      const normSetSpecialty = normalizeStr(set.specialty);
      const isSpecialtyMatch =
        !normSpecialty ||
        !normSetSpecialty ||
        normSetSpecialty === normSpecialty ||
        normSpecialty.includes(normSetSpecialty) ||
        normSetSpecialty.includes(normSpecialty);

      const isMemberMatch = normCorrect
        ? set.members.some((m) => normalizeStr(m) === normCorrect)
        : false;

      const isContextMatch =
        isSpecialtyMatch &&
        normTopics.length > 0 &&
        set.context.some((ctx) => {
          const normCtx = normalizeStr(ctx);
          if (!normCtx) return false;
          return normTopics.some(
            (top) => top.includes(normCtx) || normCtx.includes(top)
          );
        });

      // Inclui o set APENAS se o contexto específico bater OU se a resposta for membro conhecido do set
      if (isContextMatch || isMemberMatch) {
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
   * Fonte 4 (DeCS / CID-10): busca termos irmãos da mesma categoria DeCS/CID-10 no servidor SQLite
   */
  async getDecsCandidates(
    correctAnswerText: string,
    entityType?: MedicalEntityType,
    limit: number = 8
  ): Promise<DistractorCandidate[]> {
    if (!correctAnswerText) return [];
    try {
      const res = await fetch(
        apiUrl(`/api/decs-siblings?term=${encodeURIComponent(correctAnswerText)}&limit=${limit}`)
      );
      if (!res.ok) return [];
      const data = await res.json();
      const siblings: string[] = data.siblings || [];
      const normCorrect = normalizeStr(correctAnswerText);
      return siblings
        .filter((s) => normalizeStr(s) !== normCorrect)
        .map((s) => ({
          text: s,
          entityType,
          source: 'decs' as const,
          rationale: 'Mesma categoria DeCS (classe farmacológica/diagnóstica)',
        }));
    } catch (err) {
      console.warn('[DistractorEngine] DeCS candidate lookup failed:', err);
      return [];
    }
  }

  /**
   * Fonte 0 (Prioridade Máxima): busca alternativas incorretas de questões reais de provas
   * segmentadas (confidence: 'high') cuja resposta correta seja idêntica ou semanticamente
   * similar à resposta correta atual, usando embeddings locais (sem consumo de tokens de IA).
   */
  async getRealExtractedCandidates(
    correctAnswerText: string,
    specialty?: string,
    limit: number = 8
  ): Promise<DistractorCandidate[]> {
    if (!correctAnswerText) return [];

    try {
      // 1. Busca questões com alta confiança no banco local
      const highConfidenceQuestions = await db.extractedExamQuestions
        .where('confidence')
        .equals('high')
        .toArray();

      if (!highConfidenceQuestions || highConfidenceQuestions.length === 0) return [];

      const normCorrect = normalizeStr(correctAnswerText);
      const scoredCandidates: { candidate: DistractorCandidate; score: number }[] = [];

      // Filtra questões que possuem gabarito identificado e alternativas
      const validQuestions = highConfidenceQuestions.filter(
        (q) => q.correctLetter && Array.isArray(q.options) && q.options.length >= 2
      );

      if (validQuestions.length === 0) return [];

      // Identifica as respostas corretas de cada questão válida
      const questionsWithCorrectOpt = validQuestions.map((q) => {
        const correctOpt = q.options.find(
          (o) => o.letter.toUpperCase() === q.correctLetter?.toUpperCase()
        );
        return {
          question: q,
          correctText: correctOpt ? correctOpt.text.trim() : '',
          wrongOptions: q.options.filter(
            (o) => o.letter.toUpperCase() !== q.correctLetter?.toUpperCase()
          ),
        };
      }).filter((item) => item.correctText.length > 0 && item.wrongOptions.length > 0);

      if (questionsWithCorrectOpt.length === 0) return [];

      // Checa primeiro por correspondência de string exata/subtermo (custo O(1))
      const exactMatches = questionsWithCorrectOpt.filter(
        (item) => normalizeStr(item.correctText) === normCorrect
      );

      for (const match of exactMatches) {
        for (const wrongOpt of match.wrongOptions) {
          const normWrong = normalizeStr(wrongOpt.text);
          if (normWrong && normWrong !== normCorrect) {
            scoredCandidates.push({
              candidate: {
                text: wrongOpt.text,
                source: 'extracted_exam',
                rationale: `Distrator real de prova oficial (gabarito verificado: "${match.correctText}")`,
              },
              score: 1.0,
            });
          }
        }
      }

      // Se ainda não atingiu o limite, usa similaridade vetorial local (LocalEmbeddingClient + cosineSimilarity)
      if (scoredCandidates.length < limit) {
        const otherQuestions = questionsWithCorrectOpt.filter(
          (item) => normalizeStr(item.correctText) !== normCorrect
        );

        if (otherQuestions.length > 0) {
          try {
            // Extrai embeddings locais sem gastar tokens
            const textsToEmbed = [correctAnswerText, ...otherQuestions.map((q) => q.correctText)];
            const embeddings = await localEmbeddingClient.generateEmbeddings(textsToEmbed);
            const targetEmbedding = embeddings[0];

            if (targetEmbedding) {
              for (let i = 0; i < otherQuestions.length; i++) {
                const candEmb = embeddings[i + 1];
                if (!candEmb) continue;

                const sim = cosineSimilarity(targetEmbedding, candEmb);
                // Considera relacionado se similaridade >= 0.45
                if (sim >= 0.45 && sim <= 0.98) {
                  const item = otherQuestions[i];
                  for (const wrongOpt of item.wrongOptions) {
                    const normWrong = normalizeStr(wrongOpt.text);
                    if (normWrong && normWrong !== normCorrect) {
                      scoredCandidates.push({
                        candidate: {
                          text: wrongOpt.text,
                          source: 'extracted_exam',
                          rationale: `Distrator real de prova de residência (${(sim * 100).toFixed(0)}% similaridade com gabarito)`,
                        },
                        score: sim,
                      });
                    }
                  }
                }
              }
            }
          } catch (embedErr) {
            console.warn('[DistractorEngine] Embedding similarity fallback failed:', embedErr);
          }
        }
      }

      // Ordena por score decrescente
      scoredCandidates.sort((a, b) => b.score - a.score);

      // Deduplica
      const uniqueMap = new Map<string, DistractorCandidate>();
      for (const { candidate } of scoredCandidates) {
        const norm = normalizeStr(candidate.text);
        if (!uniqueMap.has(norm)) {
          uniqueMap.set(norm, candidate);
        }
      }

      return Array.from(uniqueMap.values()).slice(0, limit);
    } catch (err) {
      console.warn('[DistractorEngine] Error fetching extracted exam candidates:', err);
      return [];
    }
  }

  /**
   * Combina as cinco fontes:
   * 1. Distratores reais de provas extraídas (PRIORIDADE MÁXIMA)
   * 2. Grafo relacional de conhecimento
   * 3. Confusion Sets estáticos
   * 4. DeCS / CID-10
   * 5. Busca Semântica por Embeddings Locais
   *
   * Deduplica (case-insensitive por `text`), prioriza na ordem:
   * extracted_exam > grafo > banco_estatico > decs > semantico
   * e limita ao número solicitado (default 8).
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

    const normCorrect = normalizeStr(correctAnswerText);
    const resultMap = new Map<string, DistractorCandidate>();

    // 0. PRIORIDADE MÁXIMA: Distratores reais de provas extraídas
    if (correctAnswerText) {
      try {
        const realCandidates = await this.getRealExtractedCandidates(
          correctAnswerText,
          specialty,
          limit
        );
        for (const item of realCandidates) {
          const normText = normalizeStr(item.text);
          if (normCorrect && normText === normCorrect) continue;
          if (!resultMap.has(normText)) {
            resultMap.set(normText, item);
          }
        }
      } catch (err) {
        console.warn('[DistractorEngine] Real extracted candidates lookup failed:', err);
      }
    }

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
    if (resultMap.size < limit) {
      for (const key of keysToSearch) {
        try {
          const candidatesForKey = await this.getGraphCandidates(key, entityType);
          graphCandidates.push(...candidatesForKey);
        } catch (err) {
          console.warn(`[DistractorEngine] Error fetching graph candidates for key "${key}":`, err);
        }
      }
    }

    const staticCandidates = resultMap.size < limit
      ? this.getStaticCandidates(correctAnswerText, specialty, topics)
      : [];

    // 1. Complementa com candidatos dinâmicos do grafo relacional
    if (resultMap.size < limit) {
      for (const item of graphCandidates) {
        const normText = normalizeStr(item.text);
        if (normCorrect && normText === normCorrect) continue;
        if (!resultMap.has(normText)) {
          resultMap.set(normText, item);
        }
      }
    }

    // 2. Complementa com candidatos estáticos dos confusion sets
    if (resultMap.size < limit) {
      for (const item of staticCandidates) {
        const normText = normalizeStr(item.text);
        if (normCorrect && normText === normCorrect) continue;
        if (!resultMap.has(normText)) {
          resultMap.set(normText, item);
        }
      }
    }

    // 2.5. Complementa com DeCS (categoria oficial) se ainda houver espaço
    if (resultMap.size < limit && correctAnswerText) {
      try {
        const decsCandidates = await this.getDecsCandidates(correctAnswerText, entityType, limit);
        for (const item of decsCandidates) {
          const normText = normalizeStr(item.text);
          if (normCorrect && normText === normCorrect) continue;
          if (!resultMap.has(normText)) {
            resultMap.set(normText, item);
          }
        }
      } catch (err) {
        console.warn('[DistractorEngine] DeCS lookup failed:', err);
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

    const resultList = Array.from(resultMap.values()).filter((c) => isValidOptionText(c.text));

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
