import { StateNotifier, stateNotifierProvider } from '../../core/riverpod';
import { FlashCard, CardDifficulty, CardType, ImageOcclusionRect } from '../../domain/entities/Card';
import { medKnowledgeRepository, MedKnowledgeRepository } from '../../data/repositories_impl/MedKnowledgeRepository';
import { createInitialSM2State } from '../../core/algorithm/sm2';
import { knowledgeGraphService } from '../../data/services/KnowledgeGraphService';

export interface CardState {
  cards: FlashCard[];          // Filtered cards for active display
  allCards: FlashCard[];       // All cards in current deck
  deckId: string | null;
  loading: boolean;
  searchQuery: string;
  selectedDifficulty?: CardDifficulty | 'Todas';
  selectedTag?: string;
}

const initialCardState: CardState = {
  cards: [],
  allCards: [],
  deckId: null,
  loading: false,
  searchQuery: '',
  selectedDifficulty: 'Todas',
};

export class CardNotifier extends StateNotifier<CardState> {
  private repo: MedKnowledgeRepository;

  constructor() {
    super(initialCardState);
    this.repo = medKnowledgeRepository;
  }

  /**
   * Carregar cards de um baralho específico
   */
  async loadCards(deckId: string): Promise<void> {
    this.updateState((prev) => ({ ...prev, deckId, loading: true }));
    try {
      const cards = await this.repo.getCardsByDeck(deckId);
      this.updateState((prev) => {
        const next = { ...prev, allCards: cards, loading: false };
        return this.deriveState(next);
      });
    } catch (err) {
      console.error('[CardNotifier] Erro ao carregar cards:', err);
      this.updateState((prev) => ({ ...prev, loading: false }));
    }
  }

  /**
   * 1. Criar Flashcard
   */
  async createCard(params: {
    deckId: string;
    type: CardType;
    front: string;
    back: string;
    imageUrl?: string;
    audioUrl?: string;
    audioText?: string;
    tags: string[];
    subject?: string;
    subtopic?: string;
    topic?: string;
    difficulty?: CardDifficulty;
    highYield?: boolean;
    hint?: string;
    mnemonic?: string;
    generateReversed?: boolean;
    occlusionRects?: ImageOcclusionRect[];
  }): Promise<FlashCard> {
    const now = new Date().toISOString();
    const newCard: FlashCard = {
      id: `card_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      deckId: params.deckId,
      type: params.type,
      front: params.front,
      back: params.back,
      imageUrl: params.imageUrl || undefined,
      audioUrl: params.audioUrl || undefined,
      audioText: params.audioText || undefined,
      tags: params.tags,
      subject: params.subject || undefined,
      subtopic: params.subtopic || undefined,
      topic: params.topic || undefined,
      difficulty: params.difficulty || 'Médio',
      highYield: params.highYield ?? false,
      hint: params.hint || undefined,
      mnemonic: params.mnemonic || undefined,
      generateReversed: params.generateReversed || undefined,
      occlusionRects: params.occlusionRects || undefined,
      createdAt: now,
      updatedAt: now,
      sm2State: createInitialSM2State(),
      history: [],
    };

    await this.repo.addCard(newCard);
    if (this.state.deckId === params.deckId) {
      await this.loadCards(params.deckId);
    }

    return newCard;
  }

  /**
   * 2. Editar Flashcard
   */
  async updateCard(id: string, updates: Partial<Omit<FlashCard, 'id' | 'createdAt'>>): Promise<FlashCard> {
    const allCards = await this.repo.getAllCards();
    const existing = allCards.find((c) => c.id === id);
    if (!existing) throw new Error(`Flashcard ${id} não encontrado.`);

    const updatedCard: FlashCard = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.repo.updateCard(updatedCard);
    if (this.state.deckId) {
      await this.loadCards(this.state.deckId);
    }

    return updatedCard;
  }

  /**
   * 3. Excluir Flashcard
   */
  async deleteCard(id: string): Promise<boolean> {
    if (!this.state.deckId) return false;
    const success = await this.repo.deleteCard(id, this.state.deckId);
    if (success) {
      knowledgeGraphService.pruneOrphanedLinks('flashcard', id).catch((err) =>
        console.warn('[cardRiverpodStore] Failed to prune orphaned links:', err)
      );
      await this.loadCards(this.state.deckId);
    }
    return success;
  }

  /**
   * 4. Duplicar Flashcard
   */
  async duplicateCard(id: string): Promise<FlashCard> {
    const allCards = await this.repo.getAllCards();
    const existing = allCards.find((c) => c.id === id);
    if (!existing) throw new Error(`Flashcard ${id} não encontrado.`);

    const now = new Date().toISOString();
    const duplicated: FlashCard = {
      ...existing,
      id: `card_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      front: `${existing.front} (Cópia)`,
      createdAt: now,
      updatedAt: now,
      sm2State: createInitialSM2State(),
      history: [],
    };

    await this.repo.addCard(duplicated);
    if (this.state.deckId) {
      await this.loadCards(this.state.deckId);
    }

    return duplicated;
  }

  /**
   * 5. Pesquisar Flashcards
   */
  setSearchQuery(query: string): void {
    this.updateState((prev) => {
      const next = { ...prev, searchQuery: query };
      return this.deriveState(next);
    });
  }

  /**
   * 6. Filtrar por Grau de Dificuldade
   */
  setDifficultyFilter(difficulty: CardDifficulty | 'Todas'): void {
    this.updateState((prev) => {
      const next = { ...prev, selectedDifficulty: difficulty };
      return this.deriveState(next);
    });
  }

  private deriveState(currentState: CardState): CardState {
    const { allCards, searchQuery, selectedDifficulty } = currentState;

    let filtered = allCards.filter((card) => {
      const matchesDifficulty =
        !selectedDifficulty || selectedDifficulty === 'Todas' || card.difficulty === selectedDifficulty;

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        card.front.toLowerCase().includes(q) ||
        card.back.toLowerCase().includes(q) ||
        card.tags.some((t) => t.toLowerCase().includes(q)) ||
        (card.subject && card.subject.toLowerCase().includes(q)) ||
        (card.topic && card.topic.toLowerCase().includes(q)) ||
        (card.subtopic && card.subtopic.toLowerCase().includes(q));

      return matchesDifficulty && matchesSearch;
    });

    return {
      ...currentState,
      cards: filtered,
    };
  }
}

export const cardRiverpodProvider = stateNotifierProvider<CardNotifier, CardState>(
  () => new CardNotifier()
);
