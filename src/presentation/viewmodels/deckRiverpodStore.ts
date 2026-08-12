import { StateNotifier, stateNotifierProvider } from '../../core/riverpod';
import { Deck } from '../../domain/entities/Deck';
import { medKnowledgeRepository, MedKnowledgeRepository } from '../../data/repositories_impl/MedKnowledgeRepository';

export type DeckSortOption =
  | 'favorite'
  | 'title'
  | 'title_desc'
  | 'dueCards'
  | 'totalCards'
  | 'createdAt'
  | 'retention';

export type SmartFilterOption = 'all' | 'due' | 'favorites' | 'root' | 'highYield';

export type GroupingMode = 'none' | 'category' | 'discipline' | 'date' | 'folder';

export interface DeckState {
  decks: Deck[];               // Filtered and sorted list of decks for active view
  allDecks: Deck[];            // Full unfiltered list of decks from database
  loading: boolean;
  selectedCategory: string;
  searchQuery: string;
  sortBy: DeckSortOption;
  smartFilter: SmartFilterOption;
  groupingMode: GroupingMode;
  selectedFolderId?: string;   // Active folder filter if applicable
  categories: string[];
  folders: string[];
  totalDueCards: number;
  totalCards: number;
}

const initialDeckState: DeckState = {
  decks: [],
  allDecks: [],
  loading: true,
  selectedCategory: 'Todas',
  searchQuery: '',
  sortBy: 'favorite',
  smartFilter: 'all',
  groupingMode: 'none',
  categories: ['Todas'],
  folders: [],
  totalDueCards: 0,
  totalCards: 0,
};

export class DeckNotifier extends StateNotifier<DeckState> {
  private repo: MedKnowledgeRepository;

  constructor() {
    super(initialDeckState);
    this.repo = medKnowledgeRepository;
    this.loadDecks();
  }

  /**
   * Load/Refresh decks from MedKnowledgeRepository
   */
  async loadDecks(): Promise<void> {
    this.updateState((prev) => ({ ...prev, loading: true }));
    try {
      const allDecks = await this.repo.getDecks();
      this.computeState(allDecks);
    } catch (err) {
      console.error('[DeckNotifier] Erro ao carregar baralhos:', err);
      this.updateState((prev) => ({ ...prev, loading: false }));
    }
  }

  /**
   * 1. Criar Baralho
   */
  async createDeck(params: {
    title: string;
    description?: string;
    category: string;
    icon: string;
    color: string;
    folderId?: string;
    tags?: string[];
  }): Promise<Deck> {
    const newDeck = await this.repo.createDeck({
      title: params.title,
      description: params.description || '',
      category: params.category,
      icon: params.icon,
      color: params.color,
      folderId: params.folderId,
      tags: params.tags || [params.category, 'MedAnki'],
    });

    await this.loadDecks();
    return newDeck;
  }

  /**
   * 2. Editar Baralho
   */
  async editDeck(id: string, updates: Partial<Omit<Deck, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Deck> {
    const existing = await this.repo.getDeckById(id);
    if (!existing) throw new Error(`Baralho ${id} não encontrado.`);

    const updated = await this.repo.updateDeck({
      ...existing,
      ...updates,
    });

    await this.loadDecks();
    return updated;
  }

  /**
   * 3. Excluir Baralho
   */
  async deleteDeck(id: string): Promise<boolean> {
    const success = await this.repo.deleteDeck(id);
    if (success) {
      await this.loadDecks();
    }
    return success;
  }

  /**
   * 4. Duplicar Baralho
   */
  async duplicateDeck(id: string): Promise<Deck> {
    const duplicated = await this.repo.duplicateDeck(id);
    await this.loadDecks();
    return duplicated;
  }

  /**
   * 5. Mover Baralho para uma pasta ou raiz
   */
  async moveDeck(id: string, folderId?: string): Promise<Deck> {
    const moved = await this.repo.moveDeck(id, folderId);
    await this.loadDecks();
    return moved;
  }

  /**
   * 6. Favoritar/Desfavoritar Baralho
   */
  async toggleFavorite(id: string): Promise<Deck> {
    const toggled = await this.repo.toggleFavorite(id);
    await this.loadDecks();
    return toggled;
  }

  /**
   * Resetar Progresso do Baralho
   */
  async resetProgress(id: string): Promise<Deck> {
    const reset = await this.repo.resetProgress(id);
    await this.loadDecks();
    return reset;
  }

  /**
   * 7. Pesquisar Baralhos
   */
  setSearchQuery(query: string): void {
    this.updateState((prev) => {
      const nextState = { ...prev, searchQuery: query };
      return this.deriveState(nextState);
    });
  }

  /**
   * 8. Ordenar Baralhos
   */
  setSortBy(sort: DeckSortOption): void {
    this.updateState((prev) => {
      const nextState = { ...prev, sortBy: sort };
      return this.deriveState(nextState);
    });
  }

  setSmartFilter(filter: SmartFilterOption): void {
    this.updateState((prev) => {
      const nextState = { ...prev, smartFilter: filter };
      return this.deriveState(nextState);
    });
  }

  setGroupingMode(mode: GroupingMode): void {
    this.updateState((prev) => {
      const nextState = { ...prev, groupingMode: mode };
      return this.deriveState(nextState);
    });
  }

  setSelectedCategory(category: string): void {
    this.updateState((prev) => {
      const nextState = { ...prev, selectedCategory: category };
      return this.deriveState(nextState);
    });
  }

  setSelectedFolder(folderId?: string): void {
    this.updateState((prev) => {
      const nextState = { ...prev, selectedFolderId: folderId };
      return this.deriveState(nextState);
    });
  }

  /**
   * Private helper to compute categories, total counts, and apply search/sort filters
   */
  private computeState(allDecks: Deck[]): void {
    const categories = ['Todas', ...Array.from(new Set(allDecks.map((d) => d.category)))];
    const folders = Array.from(
      new Set(allDecks.map((d) => d.folderId).filter((f): f is string => Boolean(f)))
    );
    const totalDueCards = allDecks.reduce((sum, d) => sum + (d.dueCards || 0), 0);
    const totalCards = allDecks.reduce((sum, d) => sum + (d.totalCards || 0), 0);

    const baseState: DeckState = {
      ...this.state,
      allDecks,
      categories,
      folders,
      totalDueCards,
      totalCards,
      loading: false,
    };

    this.state = this.deriveState(baseState);
  }

  private deriveState(currentState: DeckState): DeckState {
    const { allDecks, selectedCategory, searchQuery, sortBy, selectedFolderId, smartFilter } = currentState;

    let filtered = allDecks.filter((deck) => {
      const matchesCategory = selectedCategory === 'Todas' || deck.category === selectedCategory;
      const matchesFolder = !selectedFolderId || deck.folderId === selectedFolderId;
      
      let matchesSmartFilter = true;
      if (smartFilter === 'due') {
        matchesSmartFilter = (deck.dueCards || 0) > 0;
      } else if (smartFilter === 'favorites') {
        matchesSmartFilter = !!deck.isFavorite;
      } else if (smartFilter === 'root') {
        matchesSmartFilter = !deck.folderId;
      } else if (smartFilter === 'highYield') {
        matchesSmartFilter = deck.tags.some(t => t.toLowerCase().includes('highyield') || t.toLowerCase().includes('high yield')) || (deck.dueCards || 0) > 10;
      }

      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        deck.title.toLowerCase().includes(query) ||
        deck.description.toLowerCase().includes(query) ||
        deck.category.toLowerCase().includes(query) ||
        (deck.folderId && deck.folderId.toLowerCase().includes(query)) ||
        deck.tags.some((t) => t.toLowerCase().includes(query));

      return matchesCategory && matchesFolder && matchesSmartFilter && matchesSearch;
    });

    // Apply Sorting
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'favorite':
          if (a.isFavorite && !b.isFavorite) return -1;
          if (!a.isFavorite && b.isFavorite) return 1;
          return a.title.localeCompare(b.title);
        case 'title':
          return a.title.localeCompare(b.title);
        case 'title_desc':
          return b.title.localeCompare(a.title);
        case 'dueCards':
          return (b.dueCards || 0) - (a.dueCards || 0);
        case 'totalCards':
          return (b.totalCards || 0) - (a.totalCards || 0);
        case 'createdAt':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'retention': {
          const retA = a.totalCards > 0 ? (a.totalCards - a.dueCards) / a.totalCards : 0;
          const retB = b.totalCards > 0 ? (b.totalCards - b.dueCards) / b.totalCards : 0;
          return retB - retA;
        }
        default:
          return 0;
      }
    });

    return {
      ...currentState,
      decks: filtered,
    };
  }
}

export const deckRiverpodProvider = stateNotifierProvider<DeckNotifier, DeckState>(
  () => new DeckNotifier()
);
