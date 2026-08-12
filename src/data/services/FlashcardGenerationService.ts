import { FlashCard } from '../../domain/entities/Card';
import { FlashcardGenerationOptions } from '../../domain/entities/DocumentImport';
import { Question } from '../../domain/entities/Question';
import { db } from '../db/database';
import { FlashcardRepositoryImpl } from '../repositories_impl/FlashcardRepositoryImpl';
import { createInitialSM2State } from '../../core/algorithm/sm2';
import { ragEngine } from './RAGEngine';
import { SemanticChunkResult } from './RealSemanticSearchService';
import { knowledgeGraphService } from './KnowledgeGraphService';
import { isValidGeneratedCard } from '../../core/utils/contentValidation';
import { mapWithConcurrency } from '../../core/utils/asyncUtils';
import { cosineSimilarity } from './cosineSimilarity';
import { formatCompactAntiDuplicationList } from '../../core/utils/termExtractor';
import { apiUrl } from '../../lib/apiBaseUrl';

export class FlashcardGenerationService {
  public async generateFlashcards(options: FlashcardGenerationOptions): Promise<FlashCard[]> {
    const totalQuantity = options.cardCount || 5;
    const MAX_ITEMS_PER_AI_CALL = 8;

    // Dynamic RAG topK calculation: broader reference context for larger card batches up to a cap of 30 chunks
    // Multiplicadores condicionais ao nível de detalhamento:
    // - "resumido": 0.65 (reduz ~35%, foca apenas chunks mais relevantes e definições)
    // - "intermediario": 1.0 (mantém valor calculado como meio-termo)
    // - "completo": 1.2 (até +20%, para cobrir mais contexto de fisiopatologia e diretrizes)
    const LEVEL_MULTIPLIERS: Record<string, number> = {
      resumido: 0.65,
      intermediario: 1.0,
      completo: 1.2,
    };

    const baseTopK = 5;
    const levelMultiplier = LEVEL_MULTIPLIERS[options.level || 'intermediario'] || 1.0;
    const topK = Math.min(30, Math.ceil((baseTopK + Math.ceil(totalQuantity / 3)) * levelMultiplier));

    // 1. Semantic Chunk Retrieval via RAGEngine (Fase 31)
    let retrievedChunks: SemanticChunkResult[] = [];
    try {
      retrievedChunks = await ragEngine.retrieveContext(options.subject || options.text || 'Medicina', {
        topK,
        subject: options.subject,
        deckId: options.deckId,
      });
    } catch (err) {
      console.warn('[FlashcardGenerationService] RAG retrieval skipped or failed:', err);
    }

    // 2. Anti-Duplication: Fetch existing deck concepts via RAGEngine (Fase 32)
    let existingCardsSummary = '';
    try {
      existingCardsSummary = await ragEngine.getExistingDeckConcepts(options.deckId);
    } catch (err) {
      console.warn('[FlashcardGenerationService] Deck concepts retrieval skipped:', err);
    }

    // Split total requested quantity into batches of up to MAX_ITEMS_PER_AI_CALL (8)
    const batchQuantities: number[] = [];
    let rem = totalQuantity;
    while (rem > 0) {
      const current = Math.min(rem, MAX_ITEMS_PER_AI_CALL);
      batchQuantities.push(current);
      rem -= current;
    }

    const allRawCards: any[] = [];

    const batchResults = await mapWithConcurrency(batchQuantities, 3, async (batchQty, batchIdx) => {
      const payload = {
        ...options,
        cardCount: batchQty,
        retrievedChunks,
        topK, // Passar topK calculado para o servidor (para logging/validação)
        existingCardsSummary:
          batchIdx > 0 && allRawCards.length > 0
            ? `${existingCardsSummary}\nLote ${batchIdx}:\n${formatCompactAntiDuplicationList(allRawCards.map((c) => c.front), 30)}`
            : existingCardsSummary,
      };

      const response = await fetch(apiUrl('/api/generate-cards'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Erro ao gerar lote ${batchIdx + 1} de flashcards via Gemini.`);
      }

      const data = await response.json();
      return data.cards || [];
    });

    for (const bCards of batchResults) {
      allRawCards.push(...bCards);
    }

    const validRawCards = allRawCards.filter(isValidGeneratedCard);
    if (validRawCards.length < allRawCards.length) {
      console.warn(
        `[FlashcardGenerationService] Filtered out ${allRawCards.length - validRawCards.length} invalid cards from output.`
      );
    }

    const canonicalKeys = Array.from(
      new Set(
        retrievedChunks
          .flatMap((c) => c.entities || [])
          .map((e) => e.canonicalKey)
          .filter(Boolean)
      )
    );

    let cards: FlashCard[] = validRawCards.map((rc: any, index: number) => ({
      id: `ai-card-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`,
      deckId: options.deckId,
      type: rc.type || (options.cardType === 'cloze' ? 'cloze' : 'basic'),
      front: rc.front || '',
      back: rc.back || '',
      hint: rc.hint || undefined,
      tags: rc.tags && rc.tags.length ? rc.tags : [options.subject || 'Medicina'],
      difficulty: rc.difficulty || 'Médio',
      highYield: Boolean(rc.highYield),
      mnemonic: rc.mnemonic || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sm2State: createInitialSM2State(),
    }));

    if (canonicalKeys.length > 0) {
      for (const card of cards) {
        knowledgeGraphService.linkContentToEntities('flashcard', card.id, canonicalKeys).catch((err) => {
          console.warn('[FlashcardGenerationService] Failed linking card to graph entities:', err);
        });
      }
    }

    // 3. Best-effort Semantic Deduplication against existing deck concepts
    try {
      const existingConcepts = await ragEngine.getExistingDeckConceptsWithEmbeddings(options.deckId);
      const existingEmbeddings = existingConcepts.filter((c) => c.embedding && c.embedding.length > 0);

      if (existingEmbeddings.length > 0 && cards.length > 0) {
        const newCardTexts = cards.map((c) => c.front.replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, '$1').trim());

        const res = await fetch(apiUrl('/api/embeddings'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: newCardTexts }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.embeddings)) {
            const newEmbeddings: number[][] = data.embeddings;
            const threshold = 0.92;
            const uniqueCards: FlashCard[] = [];
            let duplicateCount = 0;

            for (let i = 0; i < cards.length; i++) {
              const cardEmb = newEmbeddings[i];
              if (!cardEmb || cardEmb.length === 0) {
                uniqueCards.push(cards[i]);
                continue;
              }

              let isDuplicate = false;
              for (const existing of existingEmbeddings) {
                if (existing.embedding) {
                  const similarity = cosineSimilarity(cardEmb, existing.embedding);
                  if (similarity >= threshold) {
                    isDuplicate = true;
                    break;
                  }
                }
              }

              if (isDuplicate) {
                duplicateCount++;
              } else {
                uniqueCards.push(cards[i]);
              }
            }

            if (duplicateCount > 0) {
              console.warn(
                `[FlashcardGenerationService] Descartados ${duplicateCount} flashcard(s) por duplicidade semântica (similaridade >= ${threshold}).`
              );
            }
            cards = uniqueCards;
          }
        }
      }
    } catch (err) {
      console.warn('[FlashcardGenerationService] Semantic deduplication skipped due to error:', err);
    }

    // Validação pós-geração: log de aviso se há discrepância de tamanho
    if (cards.length > 0) {
      const avgBackLength = cards.reduce((sum, c) => sum + (c.back?.length || 0), 0) / cards.length;
      const expectedBackLengthsByLevel: Record<string, { min: number; max: number }> = {
        resumido: { min: 30, max: 150 },
        intermediario: { min: 100, max: 300 },
        completo: { min: 200, max: 600 },
      };
      const expected = expectedBackLengthsByLevel[options.level || 'intermediario'];
      if (avgBackLength < expected.min || avgBackLength > expected.max) {
        console.warn(
          `[FlashcardGenerationService] Level "${options.level}": average back length (${Math.round(avgBackLength)} chars) ` +
          `is outside expected range [${expected.min}, ${expected.max}] — diferenciação de nível pode não estar funcionando corretamente.`
        );
      }
    }

    return cards;
  }

  public async regenerateSingleCard(card: FlashCard, contextText: string, subject: string): Promise<FlashCard> {
    const response = await fetch(apiUrl('/api/regenerate-card'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card, contextText, subject }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Erro ao regenerar o flashcard com Gemini.');
    }

    const data = await response.json();
    const rc = data.card || {};

    return {
      ...card,
      type: rc.type || card.type,
      front: rc.front || card.front,
      back: rc.back || card.back,
      hint: rc.hint || card.hint,
      tags: rc.tags || card.tags,
      difficulty: rc.difficulty || card.difficulty,
      highYield: rc.highYield !== undefined ? Boolean(rc.highYield) : card.highYield,
      mnemonic: rc.mnemonic || card.mnemonic,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Converte questões de simulados selecionadas em flashcards atômicos de recordação ativa via Gemini
   */
  public async generateFlashcardsFromQuestions(
    questions: Question[],
    targetDeckId: string
  ): Promise<FlashCard[]> {
    if (!questions || questions.length === 0) return [];

    const flashcardRepo = new FlashcardRepositoryImpl();

    const results = await mapWithConcurrency(questions, 3, async (q) => {
      try {
        const response = await fetch(apiUrl('/api/reformulate-question-to-flashcard'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || `Erro ao reformular questão ${q.id}`);
        }

        const data = await response.json();
        const rawCards: any[] = data.cards || [];

        // Buscar canonical keys da questão no Grafo de Conhecimento
        let canonicalKeys: string[] = [];
        try {
          const qLinks = await db.graphContentLinks
            .where('canonicalKey')
            .above('')
            .and((r) => r.contentType === 'question' && r.contentId === q.id)
            .toArray();

          canonicalKeys = qLinks.map((l) => l.canonicalKey);

          if (canonicalKeys.length === 0 && q.specialty) {
            canonicalKeys = [q.specialty.toLowerCase().trim()];
            if (q.topic) canonicalKeys.push(q.topic.toLowerCase().trim());
          }
        } catch (err) {
          console.warn(`[FlashcardGenerationService] Falha ao obter canonicalKeys da questão ${q.id}:`, err);
        }

        const createdCards: FlashCard[] = [];

        for (let i = 0; i < rawCards.length; i++) {
          const rc = rawCards[i];
          const cardId = `ai-card-q-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`;
          const now = new Date().toISOString();

          const tags = Array.from(
            new Set(
              [
                ...(rc.tags || []),
                q.specialty,
                q.topic,
                'Simulado',
                'Revisão',
                `q-${q.id}`,
              ].filter((t): t is string => Boolean(t) && typeof t === 'string')
            )
          );

          const card: FlashCard = {
            id: cardId,
            deckId: targetDeckId,
            type: rc.type || 'basic',
            front: rc.front || '',
            back: rc.back || '',
            hint: rc.hint || undefined,
            tags,
            difficulty: rc.difficulty || 'Médio',
            highYield: rc.highYield !== undefined ? Boolean(rc.highYield) : true,
            mnemonic: rc.mnemonic || undefined,
            canonicalKeys,
            createdAt: now,
            updatedAt: now,
            sm2State: createInitialSM2State(),
          };

          createdCards.push(card);

          // Vincular card no Grafo de Conhecimento
          if (canonicalKeys.length > 0) {
            knowledgeGraphService.linkContentToEntities('flashcard', cardId, canonicalKeys).catch((err) => {
              console.warn('[FlashcardGenerationService] Erro ao vincular card ao grafo:', err);
            });
          }

          // Se a questão foi errada, registrar sinal em cardSignals
          if (q.isAnswered && q.isCorrect === false) {
            try {
              await db.cardSignals.put({
                id: `sig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                cardId,
                signalType: 'wrong_related_question',
                sourceId: q.id,
                weight: 1.5,
                createdAt: now,
                consumed: false,
              });
            } catch (sigErr) {
              console.warn('[FlashcardGenerationService] Erro ao registrar sinal de questão incorreta:', sigErr);
            }
          }
        }

        return createdCards;
      } catch (err) {
        console.error(`[FlashcardGenerationService] Erro ao converter questão ${q.id}:`, err);
        return [];
      }
    });

    const allCards = results.flat();

    if (allCards.length > 0) {
      await flashcardRepo.saveMultipleCards(allCards);
      try {
        await flashcardRepo.recalculateDeckCounts(targetDeckId);
      } catch (err) {
        console.warn(`[FlashcardGenerationService] Could not recalculate deck counts for ${targetDeckId}:`, err);
      }
    }

    return allCards;
  }
}
