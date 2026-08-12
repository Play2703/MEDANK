import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../db/database';
import { livingCardEngine, SIGNAL_THRESHOLD_FOR_REEVALUATION } from './LivingCardEngine';
import * as aiGateway from '../../core/config/aiGateway';
import { createInitialSM2State } from '../../core/algorithm/sm2';
import { FlashCard } from '../../domain/entities/Card';

describe('LivingCardEngine Regression & Golden Rules Test Suite (Vitest)', () => {
  beforeEach(async () => {
    await db.flashcards.clear();
    await db.cardSignals.clear();
    await db.cardPendingSuggestions.clear();
    await db.graphContentLinks.clear();
    await db.knowledgeAssets.clear();
    await db.questions.clear();
    vi.restoreAllMocks();
  });

  it('1. Threshold de sinais: card com peso total de sinais abaixo de 3.0 não chama generateWithFallback nem cria sugestões pendentes', async () => {
    const parentCard: FlashCard = {
      id: 'card-below-threshold',
      deckId: 'deck-1',
      type: 'basic',
      front: 'O que é sinal de Murphy?',
      back: 'Interrupção súbita da inspiração profunda durante a palpação do ponto cístico.',
      tags: ['Semio'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sm2State: createInitialSM2State(),
    };
    await db.flashcards.put(parentCard);

    // Insere 2 sinais com peso 1.0 (total = 2.0 < 3.0)
    await db.cardSignals.put({
      id: 'sig-1',
      cardId: parentCard.id,
      signalType: 'wrong_review',
      sourceId: 'rev-1',
      weight: 1.0,
      createdAt: new Date().toISOString(),
      consumed: false,
    });
    await db.cardSignals.put({
      id: 'sig-2',
      cardId: parentCard.id,
      signalType: 'new_relevant_content',
      sourceId: 'asset-1',
      weight: 1.0,
      createdAt: new Date().toISOString(),
      consumed: false,
    });

    const aiSpy = vi.spyOn(aiGateway, 'generateWithFallback');

    const result = await livingCardEngine.processAccumulatedSignals();

    expect(aiSpy).not.toHaveBeenCalled();
    expect(result.processedCardCount).toBe(0);
    expect(result.suggestionsCreatedCount).toBe(0);

    const pendingSuggestions = await db.cardPendingSuggestions.toArray();
    expect(pendingSuggestions.length).toBe(0);
  });

  it('2. Barreira de palavra-chave (Tarefa F1): IA de triagem retorna safe_link mas texto possui palavra de risco (dose de 500mg), forçando entrada em cardPendingSuggestions', async () => {
    const parentCard: FlashCard = {
      id: 'card-risk-keyword',
      deckId: 'deck-1',
      type: 'basic',
      front: 'Qual a conduta inicial na pericardite aguda?',
      back: 'Anti-inflamatórios não esteroides em dose de 500mg de 8 em 8 horas.',
      tags: ['Cardio'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sm2State: createInitialSM2State(),
    };
    await db.flashcards.put(parentCard);

    // Insere 3 sinais para atingir o limiar = 3.0
    for (let i = 1; i <= 3; i++) {
      await db.cardSignals.put({
        id: `sig-risk-${i}`,
        cardId: parentCard.id,
        signalType: 'wrong_review',
        sourceId: `rev-${i}`,
        weight: 1.0,
        createdAt: new Date().toISOString(),
        consumed: false,
      });
    }

    // Mock generateWithFallback: triagem retorna 'safe_link', proposta gera rascunho de expansão
    const aiSpy = vi.spyOn(aiGateway, 'generateWithFallback').mockImplementation(async (options: any) => {
      if (options.prompt.includes('triagem do MedAnki')) {
        return {
          text: JSON.stringify({ recommendation: 'safe_link', reasoning: 'Triagem equivocada da IA' }),
          modelUsed: 'gemini-2.5-flash',
          usage: { totalTokenCount: 300 },
        } as any;
      }
      return {
        text: JSON.stringify({
          proposedValue: 'Ajuste de dosagem para 750mg e associação com Colchicina.',
          reasoning: 'Redefinição de posologia segura sob supervisão médica.',
        }),
        modelUsed: 'gemini-3.6-flash',
        usage: { totalTokenCount: 600 },
      } as any;
    });

    const result = await livingCardEngine.processAccumulatedSignals();

    expect(aiSpy).toHaveBeenCalledTimes(2); // 1 triagem + 1 proposta forçada pela barreira F1
    expect(result.safeLinksCount).toBe(0); // NÃO foi contabilizado como safe_link
    expect(result.suggestionsCreatedCount).toBe(1); // Virou sugestão pendente

    const pending = await db.cardPendingSuggestions.where('cardId').equals(parentCard.id).toArray();
    expect(pending.length).toBe(1);
    expect(pending[0].status).toBe('pending');
    expect(pending[0].proposedContent.proposedValue).toContain('Ajuste de dosagem');
  });

  it('3. Regra A na aprovação: approveSuggestion cria card-filho atômico e preserva pai byte-a-byte intacto', async () => {
    const originalSM2 = {
      ...createInitialSM2State(),
      interval: 15,
      repetitions: 5,
      easeFactor: 2.7,
      dueDate: '2026-09-01T00:00:00.000Z',
    };

    const parentCard: FlashCard = {
      id: 'parent-card-rule-a',
      deckId: 'deck-1',
      type: 'basic',
      front: 'Frente inalterável do card pai',
      back: 'Verso inalterável do card pai',
      tags: ['Infecciosas'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      sm2State: originalSM2,
    };
    await db.flashcards.put(parentCard);

    const pendingSuggestion = {
      id: 'sug-test-rule-a',
      cardId: parentCard.id,
      suggestionType: 'clinical_expansion' as const,
      proposedContent: {
        field: 'back' as const,
        currentValue: parentCard.back,
        proposedValue: 'Novo fato clínico atômico testável',
        reasoning: 'Erro recorrente dos alunos em provas de residência',
        newChildFront: '[Expansão] Pergunta atômica nova',
        newChildBack: 'Novo fato clínico atômico testável',
      },
      sourceSignalIds: ['sig-1'],
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    };
    await db.cardPendingSuggestions.put(pendingSuggestion);

    const newChildCard = await livingCardEngine.approveSuggestion(pendingSuggestion.id);
    expect(newChildCard).not.toBeNull();
    expect(newChildCard?.id).toContain('child');

    // Valida preservação byte-a-byte do card pai
    const parentAfter = await db.flashcards.get(parentCard.id);
    expect(parentAfter?.front).toBe('Frente inalterável do card pai');
    expect(parentAfter?.back).toBe('Verso inalterável do card pai');
    expect(parentAfter?.sm2State).toEqual(originalSM2);
    expect(parentAfter?.childCardIds).toContain(newChildCard!.id);

    // Valida isolamento do novo card filho
    const childAfter = await db.flashcards.get(newChildCard!.id);
    expect(childAfter?.parentCardId).toBe(parentCard.id);
    expect(childAfter?.back).toBe('Novo fato clínico atômico testável');
    expect(childAfter?.sm2State.repetitions).toBe(0); // SM-2 zerado
  });

  it('4. Impossibilidade estrutural: confirma que LivingCardEngine não expõe nenhum método de escrita direta em flashcards sem aprovação de sugestão pendente', async () => {
    // Inspeciona reflexivamente a instância pública do LivingCardEngine
    const publicMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(livingCardEngine)).filter(
      (m) => m !== 'constructor' && typeof (livingCardEngine as any)[m] === 'function'
    );

    // Métodos públicos esperados da API do LivingCardEngine
    expect(publicMethods.sort()).toEqual(
      ['recordNewContentSignalsForAsset', 'processAccumulatedSignals', 'approveSuggestion', 'rejectSuggestion', 'getRelatedContentForCard'].sort()
    );

    // Garante que approveSuggestion recusa ID inexistente
    const invalidApprove = await livingCardEngine.approveSuggestion('sug-inexistente');
    expect(invalidApprove).toBeNull();
  });
});
