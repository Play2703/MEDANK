import { useRiverpodState, useRiverpodNotifier } from '../../core/riverpod';
import { deckRiverpodProvider, DeckSortOption, SmartFilterOption, GroupingMode } from './deckRiverpodStore';
import { Deck } from '../../domain/entities/Deck';

export function useDeckViewModel() {
  const state = useRiverpodState(deckRiverpodProvider);
  const notifier = useRiverpodNotifier(deckRiverpodProvider);

  const createDeck = async (data: {
    title: string;
    description?: string;
    category?: string;
    icon?: string;
    color?: string;
    folderId?: string;
    tags?: string[];
  }): Promise<Deck> => {
    return await notifier.createDeck({
      title: data.title,
      description: data.description || '',
      category: data.category || 'Clínica Médica',
      icon: data.icon || 'Stethoscope',
      color: data.color || '#4F46E5',
      folderId: data.folderId,
      tags: data.tags || [],
    });
  };

  const editDeck = async (
    id: string,
    updates: Partial<Omit<Deck, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<Deck> => {
    return await notifier.editDeck(id, updates);
  };

  const deleteDeck = async (id: string): Promise<boolean> => {
    return await notifier.deleteDeck(id);
  };

  const duplicateDeck = async (id: string): Promise<Deck> => {
    return await notifier.duplicateDeck(id);
  };

  const moveDeck = async (id: string, folderId?: string): Promise<Deck> => {
    return await notifier.moveDeck(id, folderId);
  };

  const toggleFavorite = async (id: string): Promise<Deck> => {
    return await notifier.toggleFavorite(id);
  };

  const resetProgress = async (id: string): Promise<Deck> => {
    return await notifier.resetProgress(id);
  };

  return {
    // Reactive State
    decks: state.decks,
    allDecks: state.allDecks,
    loading: state.loading,
    categories: state.categories,
    folders: state.folders,
    selectedCategory: state.selectedCategory,
    setSelectedCategory: (cat: string) => notifier.setSelectedCategory(cat),
    searchQuery: state.searchQuery,
    setSearchQuery: (query: string) => notifier.setSearchQuery(query),
    sortBy: state.sortBy,
    setSortBy: (sort: DeckSortOption) => notifier.setSortBy(sort),
    smartFilter: state.smartFilter,
    activeSmartFilter: state.smartFilter,
    setSmartFilter: (filter: SmartFilterOption) => notifier.setSmartFilter(filter),
    setActiveSmartFilter: (filter: SmartFilterOption) => notifier.setSmartFilter(filter),
    groupingMode: state.groupingMode,
    setGroupingMode: (mode: GroupingMode) => notifier.setGroupingMode(mode),
    selectedFolderId: state.selectedFolderId,
    currentFolderId: state.selectedFolderId,
    setSelectedFolder: (folderId?: string) => notifier.setSelectedFolder(folderId),
    setCurrentFolderId: (folderId?: string) => notifier.setSelectedFolder(folderId),
    totalDueCards: state.totalDueCards,
    totalCards: state.totalCards,

    // Reactive Actions
    refreshDecks: () => notifier.loadDecks(),
    createDeck,
    editDeck,
    updateDeck: editDeck,
    deleteDeck,
    duplicateDeck,
    moveDeck,
    toggleFavorite,
    togglePinDeck: toggleFavorite,
    resetProgress,
    resetDeckProgress: resetProgress,
  };
}
