/**
 * LivingCardEngine - Core Service for Flashcards Vivos
 * Governed by Golden Rules:
 * REGRA A: Zero automatic clinical fact mutation. Clinical expansions are ALWAYS written as pending suggestions.
 *          Approving a clinical expansion ALWAYS creates a NEW child FlashCard with initial SM-2 state,
 *          leaving parent card's front/back and SM-2 state completely untouched.
 * REGRA B: Batch signal processing with strict threshold (SIGNAL_THRESHOLD_FOR_REEVALUATION = 3)
 *          and max batch size (MAX_CARDS_PER_BATCH_RUN = 10). Triage using LIGHT_AI_MODEL.
 */

import { db } from '../db/database';
import { FlashCard } from '../../domain/entities/Card';
import {
  CardSignalRecord,
  CardPendingSuggestionRecord,
  SuggestionType,
} from '../../domain/entities/LivingCard';
import { Question } from '../../domain/entities/Question';
import { KnowledgeAsset } from '../../domain/entities/KnowledgeAsset';
import { GraphEdgeRecord } from '../../domain/entities/ChunkEntity';
import { knowledgeGraphService } from './KnowledgeGraphService';
import { generateWithFallback, parseJsonLoose, LIGHT_AI_MODEL, PRIMARY_AI_MODEL } from '../../core/config/aiGateway';
import { createInitialSM2State } from '../../core/algorithm/sm2';
import { containsClinicalRiskKeywords } from '../../core/utils/clinicalRiskKeywords';

export const SIGNAL_THRESHOLD_FOR_REEVALUATION = 3.0;
export const MAX_CARDS_PER_BATCH_RUN = 10;
export const MAX_SIGNAL_AGE_DAYS = 90;

export interface BatchProcessResult {
  processedCardCount: number;
  suggestionsCreatedCount: number;
  safeLinksCount: number;
  totalTokensUsed: number;
  modelUsed: string;
}

export class LivingCardEngine {
  /**
   * Captures a real-time signal when a new relevant document is indexed.
   * Cheap local IndexedDB query/insert, 0 AI calls.
   */
  async recordNewContentSignalsForAsset(assetId: string): Promise<number> {
    try {
      const chunkEntities = await db.chunkEntities.where('assetId').equals(assetId).toArray();
      const docCanonicalKeys = Array.from(
        new Set(
          chunkEntities
            .flatMap((ce) => ce.entities || [])
            .map((e) => e.canonicalKey)
            .filter(Boolean)
        )
      );

      if (docCanonicalKeys.length === 0) return 0;

      const cardLinks = await db.graphContentLinks
        .where('contentType')
        .equals('flashcard')
        .and((l) => docCanonicalKeys.includes(l.canonicalKey))
        .toArray();

      const matchedCardIds = new Set(cardLinks.map((l) => l.contentId));

      const allCards = await db.flashcards.toArray();
      for (const card of allCards) {
        if (card.canonicalKeys && card.canonicalKeys.some((k) => docCanonicalKeys.includes(k))) {
          matchedCardIds.add(card.id);
        }
      }

      const now = new Date().toISOString();
      let signalCount = 0;

      for (const cardId of matchedCardIds) {
        await db.cardSignals.put({
          id: `sig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${signalCount}`,
          cardId,
          signalType: 'new_relevant_content',
          sourceId: assetId,
          weight: 1.0,
          createdAt: now,
          consumed: false,
        });
        signalCount++;
      }

      return signalCount;
    } catch (err) {
      console.warn('[LivingCardEngine] Failed to record new_relevant_content signals:', err);
      return 0;
    }
  }

  /**
   * Main Batch Signal Processor (REGRA B)
   * Process accumulated signals in batch, enforcing threshold & max run limit.
   */
  async processAccumulatedSignals(forceManual = false): Promise<BatchProcessResult> {
    const result: BatchProcessResult = {
      processedCardCount: 0,
      suggestionsCreatedCount: 0,
      safeLinksCount: 0,
      totalTokensUsed: 0,
      modelUsed: LIGHT_AI_MODEL,
    };

    try {
      // 1. Fetch unconsumed signals
      const allSignals = await db.cardSignals.toArray();
      const unconsumed = allSignals.filter((s) => !s.consumed);
      if (unconsumed.length === 0) return result;

      // 2. Filter out expired signals (> 90 days old)
      const nowMs = Date.now();
      const validSignals: CardSignalRecord[] = [];
      const expiredSignalIds: string[] = [];

      for (const sig of unconsumed) {
        const ageDays = (nowMs - new Date(sig.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > MAX_SIGNAL_AGE_DAYS) {
          expiredSignalIds.push(sig.id);
        } else {
          validSignals.push(sig);
        }
      }

      // Mark expired as consumed
      if (expiredSignalIds.length > 0) {
        await Promise.all(expiredSignalIds.map((id) => db.cardSignals.update(id, { consumed: true })));
      }

      if (validSignals.length === 0) return result;

      // 3. Group signals by cardId and calculate total weight
      const signalsByCard = new Map<string, CardSignalRecord[]>();
      for (const sig of validSignals) {
        const list = signalsByCard.get(sig.cardId) || [];
        list.push(sig);
        signalsByCard.set(sig.cardId, list);
      }

      // 4. Identify candidate cards exceeding SIGNAL_THRESHOLD_FOR_REEVALUATION
      const candidateCardEntries: Array<{ cardId: string; totalWeight: number; signals: CardSignalRecord[] }> = [];

      for (const [cardId, sigs] of signalsByCard.entries()) {
        const totalWeight = sigs.reduce((sum, s) => sum + (s.weight || 1.0), 0);
        if (totalWeight >= SIGNAL_THRESHOLD_FOR_REEVALUATION) {
          candidateCardEntries.push({ cardId, totalWeight, signals: sigs });
        }
      }

      if (candidateCardEntries.length === 0) return result;

      // Limit max cards per batch run
      const batchCandidates = candidateCardEntries.slice(0, MAX_CARDS_PER_BATCH_RUN);

      for (const entry of batchCandidates) {
        const card = await db.flashcards.get(entry.cardId);
        if (!card) {
          // Mark signals as consumed if card was deleted
          await Promise.all(entry.signals.map((s) => db.cardSignals.update(s.id, { consumed: true })));
          continue;
        }

        // Triage step using LIGHT_AI_MODEL
        const triagePrompt = `Você é o módulo de triagem do MedAnki. Avalie se os sinais acumulados neste flashcard médico justificam:
(a) "safe_link": apenas vincular conteúdos de referência já existentes (questões, capítulos, diretrizes)
(b) "clinical_expansion": sugerir uma expansão de fato clínico novo (dose, contraindicação, conduta)
(c) "new_child_card": sugerir a criação de um novo card-filho atômico
(d) "none": nenhuma ação necessária por enquanto.

Flashcard Atual:
Frente: ${card.front}
Verso: ${card.back}

Resumo dos Sinais Acumulados (Total Peso: ${entry.totalWeight}):
${entry.signals.map((s) => `- ${s.signalType} (fonte: ${s.sourceId || 'estudo'})`).join('\n')}

Responda ESTRITAMENTE em JSON:
{
  "recommendation": "safe_link" | "clinical_expansion" | "new_child_card" | "none",
  "reasoning": "Breve justificativa médica"
}`;

        let triageRes;
        try {
          triageRes = await generateWithFallback({ prompt: triagePrompt, temperature: 0.1 });
          if (triageRes.usage?.totalTokenCount) {
            result.totalTokensUsed += triageRes.usage.totalTokenCount;
          }
        } catch (triageErr) {
          console.warn(`[LivingCardEngine] Triage call failed for card ${card.id}:`, triageErr);
          continue;
        }

        const triageData = parseJsonLoose(triageRes.text || '{}');
        const recommendation = triageData.recommendation || 'none';

        // TAREFA F1: Deterministic Risk Barrier check by keyword
        const textToScan = `${card.front} ${card.back} ${triageData.reasoning || ''} ${entry.signals.map((s) => `${s.signalType} ${s.sourceId}`).join(' ')}`;
        const hasRiskKeywords = containsClinicalRiskKeywords(textToScan);

        let finalRecommendation = recommendation;
        if (finalRecommendation === 'safe_link' && hasRiskKeywords) {
          console.warn(`[LivingCardEngine] Triage recommendation "safe_link" overridden by clinical risk keyword barrier for card ${card.id}. Forcing clinical_expansion pending draft.`);
          finalRecommendation = 'clinical_expansion';
        }

        if (finalRecommendation === 'safe_link') {
          // TAREFA F2: Implement real automatic safe_link binding to Knowledge Graph
          const cardLinks = await db.graphContentLinks
            .where('contentType')
            .equals('flashcard')
            .and((l) => l.contentId === card.id)
            .toArray();

          const canonicalKeys = Array.from(
            new Set([...(card.canonicalKeys || []), ...cardLinks.map((l) => l.canonicalKey)])
          );

          if (canonicalKeys.length > 0) {
            await knowledgeGraphService.linkContentToEntities('flashcard', card.id, canonicalKeys);
          }

          for (const sig of entry.signals) {
            if (!sig.sourceId || !sig.sourceId.trim()) {
              console.warn(`[LivingCardEngine] Skipping safe_link for signal ${sig.id} due to empty or missing sourceId.`);
              continue;
            }

            try {
              if (sig.signalType === 'new_relevant_content') {
                const asset = await db.knowledgeAssets.get(sig.sourceId);
                if (!asset) {
                  console.warn(`[LivingCardEngine] Skipping safe_link for signal ${sig.id}: KnowledgeAsset ${sig.sourceId} not found in DB.`);
                  continue;
                }
                if (canonicalKeys.length > 0) {
                  await knowledgeGraphService.linkContentToEntities('knowledgeAsset', sig.sourceId, canonicalKeys);
                }
              } else if (sig.signalType === 'wrong_related_question') {
                const question = await db.questions.get(sig.sourceId);
                if (!question) {
                  console.warn(`[LivingCardEngine] Skipping safe_link for signal ${sig.id}: Question ${sig.sourceId} not found in DB.`);
                  continue;
                }
                if (canonicalKeys.length > 0) {
                  await knowledgeGraphService.linkContentToEntities('question', sig.sourceId, canonicalKeys);
                }
              }
            } catch (linkErr) {
              console.warn(`[LivingCardEngine] Error applying safe_link for signal ${sig.id}:`, linkErr);
            }
          }

          result.safeLinksCount++;
          result.processedCardCount++;
        } else if (finalRecommendation === 'clinical_expansion' || finalRecommendation === 'new_child_card') {
          // Generate structured proposal using PRIMARY_AI_MODEL
          const proposalPrompt = `Você é um especialista em medicina e Active Recall (Anki). O flashcard médico a seguir acumulou erros/novos conteúdos e precisa de uma sugestão de expansão médica atômica.

Flashcard Atual:
Frente: ${card.front}
Verso: ${card.back}

Sinais:
${entry.signals.map((s) => `- ${s.signalType} (fonte: ${s.sourceId || 'estudo'})`).join('\n')}

Crie uma proposta de expansão médica clara e concisa (dose, contraindicação, conduta prática ou diagnóstico diferencial).

Responda ESTRITAMENTE em JSON:
{
  "proposedValue": "Texto detalhado do fato clínico sugerido",
  "reasoning": "Por que esta expansão foi sugerida com base nos erros/sinais",
  "newChildFront": "Pergunta atômica para o novo card-filho",
  "newChildBack": "Resposta direta e concisa para o novo card-filho"
}`;

          let proposalRes;
          try {
            proposalRes = await generateWithFallback({ prompt: proposalPrompt, temperature: 0.2 });
            if (proposalRes.usage?.totalTokenCount) {
              result.totalTokensUsed += proposalRes.usage.totalTokenCount;
            }
          } catch (propErr) {
            console.warn(`[LivingCardEngine] Proposal generation failed for card ${card.id}:`, propErr);
            continue;
          }

          const propData = parseJsonLoose(proposalRes.text || '{}');

          // REGRA A: SAVE AS PENDING SUGGESTION ONLY! NEVER APPLY DIRECTLY TO CARD!
          const pendingSuggestion: CardPendingSuggestionRecord = {
            id: `sug_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            cardId: card.id,
            suggestionType: recommendation as SuggestionType,
            proposedContent: {
              field: recommendation === 'new_child_card' ? 'newChildFront' : 'back',
              currentValue: card.back,
              proposedValue: propData.proposedValue || propData.newChildBack || 'Expansão clínica sugerida',
              reasoning: propData.reasoning || triageData.reasoning || 'Acúmulo de sinais de revisão/questões',
              newChildFront: propData.newChildFront || `[Expansão] ${card.front}`,
              newChildBack: propData.newChildBack || propData.proposedValue || card.back,
            },
            sourceSignalIds: entry.signals.map((s) => s.id),
            status: 'pending', // MUST BE PENDING
            createdAt: new Date().toISOString(),
          };

          await db.cardPendingSuggestions.put(pendingSuggestion);
          result.suggestionsCreatedCount++;
          result.processedCardCount++;
        } else {
          result.processedCardCount++;
        }

        // Mark signals for this card as consumed
        await Promise.all(entry.signals.map((s) => db.cardSignals.update(s.id, { consumed: true })));
      }

      // Record telemetry in console log
      console.log(
        '[TokenUsage]',
        JSON.stringify({
          timestamp: new Date().toISOString(),
          endpoint: 'LivingCardEngine.processAccumulatedSignals',
          model: result.modelUsed,
          totalTokenCount: result.totalTokensUsed,
          cardsProcessed: result.processedCardCount,
          suggestionsCreated: result.suggestionsCreatedCount,
        })
      );

      return result;
    } catch (err) {
      console.error('[LivingCardEngine] Error processing accumulated signals:', err);
      return result;
    }
  }

  /**
   * Approves a pending suggestion (REGRA A)
   * Approving a clinical expansion ALWAYS creates a NEW child FlashCard with fresh SM-2 state,
   * leaving parent card's front, back, and SM-2 state completely untouched!
   */
  async approveSuggestion(suggestionId: string): Promise<FlashCard | null> {
    const sug = await db.cardPendingSuggestions.get(suggestionId);
    if (!sug || sug.status !== 'pending') return null;

    const parentCard = await db.flashcards.get(sug.cardId);
    if (!parentCard) return null;

    let newChildCard: FlashCard | null = null;

    if (sug.suggestionType === 'clinical_expansion' || sug.suggestionType === 'new_child_card') {
      // REGRA A: Create a NEW child FlashCard!
      const childFront = sug.proposedContent.newChildFront || `[Expansão] ${parentCard.front}`;
      const childBack = sug.proposedContent.newChildBack || sug.proposedContent.proposedValue;

      newChildCard = {
        id: `card_${Date.now()}_child_${Math.random().toString(36).substring(2, 6)}`,
        deckId: parentCard.deckId,
        type: parentCard.type,
        front: childFront,
        back: childBack,
        hint: parentCard.hint,
        tags: Array.from(new Set([...parentCard.tags, 'Expansão', 'FlashcardVivo'])),
        subject: parentCard.subject,
        topic: parentCard.topic,
        subtopic: parentCard.subtopic,
        difficulty: parentCard.difficulty,
        highYield: parentCard.highYield,
        parentCardId: parentCard.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sm2State: createInitialSM2State(), // Fresh SM-2 state!
        history: [],
      };

      await db.flashcards.put(newChildCard);

      // Link childCardId in parent card without mutating parent's front, back, or SM-2 state!
      const childCardIds = Array.from(new Set([...(parentCard.childCardIds || []), newChildCard.id]));
      await db.flashcards.update(parentCard.id, {
        childCardIds,
        updatedAt: new Date().toISOString(),
      });
    }

    // Mark suggestion as approved
    await db.cardPendingSuggestions.update(suggestionId, {
      status: 'approved',
      reviewedAt: new Date().toISOString(),
    });

    return newChildCard;
  }

  /**
   * Rejects a pending suggestion (REGRA A)
   */
  async rejectSuggestion(suggestionId: string): Promise<boolean> {
    const sug = await db.cardPendingSuggestions.get(suggestionId);
    if (!sug) return false;

    await db.cardPendingSuggestions.update(suggestionId, {
      status: 'rejected',
      reviewedAt: new Date().toISOString(),
    });

    return true;
  }

  /**
   * Retrieves related content for a card from the Medical Knowledge Graph (TAREFA LF3 & LF5)
   */
  async getRelatedContentForCard(cardId: string): Promise<{
    questions: Question[];
    assets: KnowledgeAsset[];
    graphEdges: GraphEdgeRecord[];
  }> {
    const card = await db.flashcards.get(cardId);
    if (!card) return { questions: [], assets: [], graphEdges: [] };

    // Get canonical keys linked to this card
    const cardLinks = await db.graphContentLinks
      .where('contentType')
      .equals('flashcard')
      .and((l) => l.contentId === cardId)
      .toArray();

    const keys = Array.from(
      new Set([...(card.canonicalKeys || []), ...cardLinks.map((l) => l.canonicalKey)])
    );

    if (keys.length === 0) return { questions: [], assets: [], graphEdges: [] };

    // Retrieve related questions and assets for these keys
    const relatedLinks = await db.graphContentLinks
      .where('canonicalKey')
      .anyOf(keys)
      .toArray();

    const questionIds = Array.from(
      new Set(relatedLinks.filter((l) => l.contentType === 'question').map((l) => l.contentId))
    );
    const assetIds = Array.from(
      new Set(relatedLinks.filter((l) => l.contentType === 'knowledgeAsset').map((l) => l.contentId))
    );

    const questions = questionIds.length > 0 ? await db.questions.bulkGet(questionIds) : [];
    const assets = assetIds.length > 0 ? await db.knowledgeAssets.bulkGet(assetIds) : [];

    // Retrieve graph edges
    const graphEdges: GraphEdgeRecord[] = [];
    for (const key of keys) {
      const neighbors = await knowledgeGraphService.getGraphNeighbors(key);
      graphEdges.push(...neighbors.incoming, ...neighbors.outgoing);
    }

    return {
      questions: questions.filter((q): q is Question => Boolean(q)),
      assets: assets.filter((a): a is KnowledgeAsset => Boolean(a)),
      graphEdges,
    };
  }
}

export const livingCardEngine = new LivingCardEngine();
