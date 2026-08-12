import { useRiverpodState, useRiverpodNotifier } from '../../core/riverpod';
import { cardRiverpodProvider } from './cardRiverpodStore';
import { FlashCard, CardDifficulty, CardType } from '../../domain/entities/Card';

export function useCardViewModel(deckId?: string) {
  const state = useRiverpodState(cardRiverpodProvider);
  const notifier = useRiverpodNotifier(cardRiverpodProvider);

  return {
    // Reactive State
    cards: state.cards,
    allCards: state.allCards,
    loading: state.loading,
    searchQuery: state.searchQuery,
    selectedDifficulty: state.selectedDifficulty,
    
    // Filters
    setSearchQuery: (query: string) => notifier.setSearchQuery(query),
    setDifficultyFilter: (diff: CardDifficulty | 'Todas') => notifier.setDifficultyFilter(diff),
    
    // Actions
    loadCards: (dId: string) => notifier.loadCards(dId),
    createCard: (params: Parameters<typeof notifier.createCard>[0]) => notifier.createCard(params),
    updateCard: (id: string, updates: Parameters<typeof notifier.updateCard>[1]) => notifier.updateCard(id, updates),
    deleteCard: (id: string) => notifier.deleteCard(id),
    duplicateCard: (id: string) => notifier.duplicateCard(id),
  };
}
