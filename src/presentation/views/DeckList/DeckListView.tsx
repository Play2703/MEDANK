import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDeckViewModel } from '../../viewmodels/useDeckViewModel';
import { useDevice } from '../../../core/responsive/DeviceContext';
import { M3Card } from '../../components/Material3/M3Card';
import { M3Button } from '../../components/Material3/M3Button';
import { M3Chip } from '../../components/Material3/M3Chip';
import { M3Modal } from '../../components/Material3/M3Modal';
import { M3Combobox } from '../../components/Material3/M3Combobox';
import { M3IconPicker } from '../../components/Material3/M3IconPicker';
import { Deck } from '../../../domain/entities/Deck';
import { DeckSortOption, SmartFilterOption, GroupingMode } from '../../viewmodels/deckRiverpodStore';
import {
  CURRICULUM_GROUPS,
  MEDICAL_DECK_ICONS,
  DEFAULT_ICON_FOR_SPECIALTY,
} from '../../../data/curriculumTopics';
import {
  HeartPulse,
  Pill,
  Brain,
  Baby,
  Stethoscope,
  Bone,
  Eye,
  Ear,
  Wind,
  Droplet,
  Microscope,
  Dna,
  Syringe,
  Thermometer,
  Activity,
  Shield,
  FlaskConical,
  BookOpen,
  UserCheck,
  Scissors,
  Sparkles,
  Plus,
  Play,
  Search,
  Flame,
  BookMarked,
  FolderPlus,
  Trash2,
  Star,
  Copy,
  Edit3,
  FolderInput,
  ArrowUpDown,
  X,
  MoreVertical,
  RotateCcw,
  Layers,
  ChevronDown,
  ChevronRight,
  Folder,
  Tag,
  Calendar,
  CheckCircle2,
  Filter,
  Grid,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  HeartPulse,
  Pill,
  Brain,
  Baby,
  Stethoscope,
  Bone,
  Eye,
  Ear,
  Wind,
  Droplet,
  Microscope,
  Dna,
  Syringe,
  Thermometer,
  Activity,
  Shield,
  FlaskConical,
  BookOpen,
  UserCheck,
  Scissors,
  Sparkles,
};

interface DeckListViewProps {
  onStartStudy: (deckId: string) => void;
  onManageCards: (deckId: string) => void;
}

export const DeckListView: React.FC<DeckListViewProps> = React.memo(({ onStartStudy, onManageCards }) => {
  const { colors } = useDevice();
  const {
    decks,
    allDecks,
    folders,
    currentFolderId,
    setCurrentFolderId,
    activeSmartFilter,
    setActiveSmartFilter,
    groupingMode,
    setGroupingMode,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    createDeck,
    deleteDeck,
    togglePinDeck,
    duplicateDeck,
    resetDeckProgress,
    updateDeck,
    moveDeck,
  } = useDeckViewModel();

  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('Clínica Médica');
  const [newIcon, setNewIcon] = useState('Stethoscope');
  const [newFolder, setNewFolder] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Edit Modal State
  const [editingDeck, setEditingDeck] = useState<Deck | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState('Clínica Médica');
  const [editIcon, setEditIcon] = useState('Stethoscope');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Move Modal State
  const [movingDeck, setMovingDeck] = useState<Deck | null>(null);
  const [targetFolder, setTargetFolder] = useState<string>('');

  // Drag & Drop State
  const [draggedDeckId, setDraggedDeckId] = useState<string | null>(null);

  // Active Menu Dropdown State (per Deck ID)
  const [activeMenuDeckId, setActiveMenuDeckId] = useState<string | null>(null);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || isSubmittingCreate) return;

    setIsSubmittingCreate(true);
    try {
      await createDeck({
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        category: newCategory,
        icon: newIcon,
        folderId: newFolder.trim() || currentFolderId || undefined,
      });

      setNewTitle('');
      setNewDesc('');
      setNewCategory('Clínica Médica');
      setNewIcon('Stethoscope');
      setNewFolder('');
      setIsCreateModalOpen(false);
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleOpenCreateModal = useCallback(() => {
    setNewTitle('');
    setNewDesc('');
    setNewCategory('Clínica Médica');
    setNewIcon('Stethoscope');
    setNewFolder('');
    setIsCreateModalOpen(true);
  }, []);

  const handleCloseCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
  }, []);

  const handleCategoryChangeForNew = useCallback((cat: string) => {
    setNewCategory(cat);
    const suggestedIcon = DEFAULT_ICON_FOR_SPECIALTY[cat] || 'Stethoscope';
    setNewIcon(suggestedIcon);
  }, []);

  const handleCategoryChangeForEdit = (cat: string) => {
    setEditCategory(cat);
    const suggestedIcon = DEFAULT_ICON_FOR_SPECIALTY[cat] || 'Stethoscope';
    setEditIcon(suggestedIcon);
  };

  const handleOpenEdit = (deck: Deck) => {
    setEditingDeck(deck);
    setEditTitle(deck.title);
    setEditDesc(deck.description || '');
    setEditCategory(deck.category || 'Clínica Médica');
    setEditIcon(deck.icon || 'Stethoscope');
    setActiveMenuDeckId(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDeck || !editTitle.trim() || isSubmittingEdit) return;

    setIsSubmittingEdit(true);
    try {
      await updateDeck(editingDeck.id, {
        title: editTitle.trim(),
        description: editDesc.trim() || undefined,
        category: editCategory,
        icon: editIcon,
      });

      setEditingDeck(null);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleOpenMove = (deck: Deck) => {
    setMovingDeck(deck);
    setTargetFolder(deck.folderId || '');
    setActiveMenuDeckId(null);
  };

  const handleMoveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movingDeck) return;

    const folderToMove = targetFolder.trim() === '' ? undefined : targetFolder.trim();
    await moveDeck(movingDeck.id, folderToMove);
    setMovingDeck(null);
  };

  const handleDragStart = (deckId: string) => {
    setDraggedDeckId(deckId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnFolder = async (targetFolderName: string) => {
    if (draggedDeckId) {
      const folderToMove = targetFolderName === 'RAIZ_ROOT' ? undefined : targetFolderName;
      await moveDeck(draggedDeckId, folderToMove);
    }
    setDraggedDeckId(null);
  };

  // Grouping Logic
  const groupedDecks = useMemo(() => {
    if (groupingMode === 'none') {
      return [{ title: 'Todos os Baralhos', key: 'all', decks }];
    }

    if (groupingMode === 'category') {
      const groups: Record<string, Deck[]> = {};
      decks.forEach((deck) => {
        const cat = deck.category || 'Outros';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(deck);
      });
      return Object.entries(groups).map(([cat, groupDecks]) => ({
        title: `Especialidade: ${cat}`,
        key: `cat_${cat}`,
        categoryName: cat,
        decks: groupDecks,
      }));
    }

    if (groupingMode === 'discipline') {
      const groups: Record<string, Deck[]> = {};
      decks.forEach((deck) => {
        const tag = deck.tags[0] || deck.category || 'Geral';
        if (!groups[tag]) groups[tag] = [];
        groups[tag].push(deck);
      });
      return Object.entries(groups).map(([tag, groupDecks]) => ({
        title: `Disciplina / Tag: #${tag}`,
        key: `tag_${tag}`,
        decks: groupDecks,
      }));
    }

    if (groupingMode === 'folder') {
      const groups: Record<string, Deck[]> = {};
      decks.forEach((deck) => {
        const folder = deck.folderId || 'Raiz';
        if (!groups[folder]) groups[folder] = [];
        groups[folder].push(deck);
      });
      return Object.entries(groups).map(([folder, groupDecks]) => ({
        title: folder === 'Raiz' ? '📁 Baralhos na Raiz' : `📁 Pasta: ${folder}`,
        key: `folder_${folder}`,
        folderName: folder,
        decks: groupDecks,
      }));
    }

    if (groupingMode === 'date') {
      const groups: Record<string, Deck[]> = {
        'Hoje / Recentes': [],
        'Esta Semana': [],
        'Este Mês': [],
        'Mais Antigos': [],
      };

      const now = new Date().getTime();
      const oneDay = 24 * 60 * 60 * 1000;

      decks.forEach((deck) => {
        const created = new Date(deck.createdAt).getTime();
        const diffDays = (now - created) / oneDay;

        if (diffDays <= 1) {
          groups['Hoje / Recentes'].push(deck);
        } else if (diffDays <= 7) {
          groups['Esta Semana'].push(deck);
        } else if (diffDays <= 30) {
          groups['Este Mês'].push(deck);
        } else {
          groups['Mais Antigos'].push(deck);
        }
      });

      return Object.entries(groups)
        .filter(([_, groupDecks]) => groupDecks.length > 0)
        .map(([label, groupDecks]) => ({
          title: label,
          key: `date_${label}`,
          decks: groupDecks,
        }));
    }

    return [{ title: 'Todos os Baralhos', key: 'all', decks }];
  }, [decks, groupingMode]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 md:pb-6">
      {/* Top Controls & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-100">Meus Baralhos de Estudo</h2>
          <p className="text-xs text-slate-300 opacity-90 mt-0.5">
            Gerencie seus flashcards médicos, organize por especialidades e pastas
          </p>
        </div>

        <M3Button
          variant="filled"
          icon={<Plus className="w-5 h-5" />}
          onClick={handleOpenCreateModal}
          className="shadow-lg bg-indigo-600 hover:bg-indigo-500 font-bold"
        >
          Criar Novo Baralho
        </M3Button>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-2xl bg-white/5 border border-white/10">
        {/* Search Input */}
        <div className="relative w-full sm:flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-50" />
          <input
            type="text"
            placeholder="Buscar por título, especialidade ou tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl bg-black/20 border border-white/10 outline-none focus:border-indigo-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Smart Filters Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar shrink-0 max-w-full">
          <M3Chip
            selected={activeSmartFilter === 'all'}
            onClick={() => setActiveSmartFilter('all')}
            label="Todos"
          />
          <M3Chip
            selected={activeSmartFilter === 'due'}
            onClick={() => setActiveSmartFilter('due')}
            label="Para Revisar Hoje"
            icon={<Flame className="w-3.5 h-3.5 text-amber-400" />}
          />
          <M3Chip
            selected={activeSmartFilter === 'highYield'}
            onClick={() => setActiveSmartFilter('highYield')}
            label="Alto Rendimento"
            icon={<Sparkles className="w-3.5 h-3.5 text-indigo-400" />}
          />
          <M3Chip
            selected={activeSmartFilter === 'favorites'}
            onClick={() => setActiveSmartFilter('favorites')}
            label="Favoritos"
            icon={<Star className="w-3.5 h-3.5 text-yellow-400" />}
          />
        </div>

        {/* Grouping & Sorting Selectors */}
        <div className="flex items-center gap-2 justify-between sm:justify-end shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-white/10">
          <div className="flex items-center gap-1 text-xs opacity-75 shrink-0">
            <Layers className="w-3.5 h-3.5" />
            <span>Agrupar:</span>
          </div>
          <select
            value={groupingMode}
            onChange={(e) => setGroupingMode(e.target.value as GroupingMode)}
            className="px-2.5 py-1.5 text-xs rounded-xl bg-black/30 border border-white/10 outline-none cursor-pointer"
          >
            <option value="none">Nenhum</option>
            <option value="category">Especialidade</option>
            <option value="folder">Pasta</option>
            <option value="discipline">Tag/Disciplina</option>
            <option value="date">Data de Criação</option>
          </select>
        </div>
      </div>

      {/* Folders Navigation Bar (If folders exist) */}
      {folders.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full no-scrollbar">
          <div className="text-xs font-bold opacity-60 flex items-center gap-1 pr-2 shrink-0">
            <Folder className="w-3.5 h-3.5" />
            <span>Pastas:</span>
          </div>

          <button
            onClick={() => setCurrentFolderId(undefined)}
            onDragOver={handleDragOver}
            onDrop={() => handleDropOnFolder('RAIZ_ROOT')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 shrink-0 ${
              !currentFolderId
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                : 'bg-white/5 border-white/10 opacity-70 hover:opacity-100'
            }`}
          >
            <span>Todas as Pastas</span>
          </button>

          {folders.map((folder) => {
            const isSelected = currentFolderId === folder;
            return (
              <button
                key={folder}
                onClick={() => setCurrentFolderId(folder)}
                onDragOver={handleDragOver}
                onDrop={() => handleDropOnFolder(folder)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5 shrink-0 ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                    : 'bg-white/5 border-white/10 opacity-70 hover:opacity-100'
                }`}
              >
                <Folder className="w-3.5 h-3.5 text-indigo-400" />
                <span>{folder}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Decks Grid Grouped */}
      {groupedDecks.length === 0 || decks.length === 0 ? (
        <div className="p-8 sm:p-12 rounded-3xl border border-dashed border-white/15 text-center space-y-3 bg-white/5">
          <BookMarked className="w-12 h-12 mx-auto text-indigo-400 opacity-60" />
          <h3 className="text-lg font-bold">Nenhum baralho encontrado</h3>
          <p className="text-xs opacity-70 max-w-sm mx-auto">
            {searchQuery
              ? `Nenhum baralho corresponde à busca "${searchQuery}".`
              : 'Você ainda não possui baralhos criados nesta pasta ou filtro.'}
          </p>
          <M3Button
            variant="filled"
            size="sm"
            onClick={handleOpenCreateModal}
            icon={<Plus className="w-4 h-4" />}
          >
            Criar Primeiro Baralho
          </M3Button>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedDecks.map((group) => (
            <div key={group.key} className="space-y-4">
              {groupingMode !== 'none' && (
                <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                  <h3 className="text-sm font-bold tracking-wide uppercase text-indigo-400">
                    {group.title}
                  </h3>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/70 font-mono">
                    {group.decks.length} baralho(s)
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.decks.map((deck) => {
                  const IconComp = ICON_MAP[deck.icon] || Stethoscope;
                  const isMenuOpen = activeMenuDeckId === deck.id;

                  return (
                    <M3Card
                      key={deck.id}
                      variant="outlined"
                      draggable
                      onDragStart={() => handleDragStart(deck.id)}
                      className={`relative p-5 space-y-4 transition-all duration-200 hover:border-indigo-500/50 hover:shadow-xl group ${
                        deck.isPinned ? 'ring-2 ring-yellow-500/30 border-yellow-500/40' : ''
                      }`}
                    >
                      {/* Top Header Card */}
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="p-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 group-hover:scale-105 transition-transform shrink-0">
                            <IconComp className="w-5 h-5 sm:w-6 sm:h-6" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/10 text-indigo-300 truncate max-w-full">
                                {deck.category || 'Geral'}
                              </span>
                              {deck.isPinned && (
                                <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400 shrink-0" />
                              )}
                            </div>
                            <h4
                              className="font-bold text-sm sm:text-base mt-1 truncate group-hover:text-indigo-300 transition-colors"
                              title={deck.title}
                            >
                              {deck.title}
                            </h4>
                          </div>
                        </div>

                        {/* Options Menu Button Reserved Space */}
                        <div className="relative shrink-0 w-8 flex justify-end">
                          <button
                            onClick={() => setActiveMenuDeckId(isMenuOpen ? null : deck.id)}
                            className="p-1.5 rounded-xl hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {/* Dropdown Menu */}
                          {isMenuOpen && (
                            <div className="absolute right-0 top-8 z-30 w-48 rounded-2xl bg-slate-900 border border-white/15 shadow-2xl p-1.5 space-y-1 text-xs animate-in fade-in duration-150">
                              <button
                                onClick={() => togglePinDeck(deck.id)}
                                className="w-full px-3 py-2 rounded-xl text-left hover:bg-white/10 flex items-center gap-2"
                              >
                                <Star className="w-3.5 h-3.5 text-yellow-400" />
                                <span>{deck.isPinned ? 'Desafixar Baralho' : 'Fixar no Topo'}</span>
                              </button>

                              <button
                                onClick={() => handleOpenEdit(deck)}
                                className="w-full px-3 py-2 rounded-xl text-left hover:bg-white/10 flex items-center gap-2"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                                <span>Editar Informações</span>
                              </button>

                              <button
                                onClick={() => handleOpenMove(deck)}
                                className="w-full px-3 py-2 rounded-xl text-left hover:bg-white/10 flex items-center gap-2"
                              >
                                <FolderInput className="w-3.5 h-3.5 text-cyan-400" />
                                <span>Mover para Pasta</span>
                              </button>

                              <button
                                onClick={() => duplicateDeck(deck.id)}
                                className="w-full px-3 py-2 rounded-xl text-left hover:bg-white/10 flex items-center gap-2"
                              >
                                <Copy className="w-3.5 h-3.5 text-purple-400" />
                                <span>Duplicar Baralho</span>
                              </button>

                              <button
                                onClick={() => resetDeckProgress(deck.id)}
                                className="w-full px-3 py-2 rounded-xl text-left hover:bg-white/10 flex items-center gap-2 text-amber-300"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Reiniciar Progresso</span>
                              </button>

                              <div className="border-t border-white/10 my-1" />

                              <button
                                onClick={() => deleteDeck(deck.id)}
                                className="w-full px-3 py-2 rounded-xl text-left hover:bg-red-500/20 text-red-400 flex items-center gap-2"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Excluir Baralho</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      {deck.description && (
                        <p className="text-xs opacity-75 line-clamp-2 leading-relaxed">
                          {deck.description}
                        </p>
                      )}

                      {/* Folder / Tag indicators */}
                      {deck.folderId && (
                        <div className="flex items-center gap-1.5 text-[11px] opacity-70">
                          <Folder className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Pasta: {deck.folderId}</span>
                        </div>
                      )}

                      {/* Stats Pills Bar */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-center">
                        <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                          <div className="text-xs font-bold text-indigo-300">
                            {deck.cardCounts?.due || 0}
                          </div>
                          <div className="text-[10px] opacity-70">Revisar</div>
                        </div>

                        <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
                          <div className="text-xs font-bold text-purple-300">
                            {deck.cardCounts?.new || 0}
                          </div>
                          <div className="text-[10px] opacity-70">Novos</div>
                        </div>

                        <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                          <div className="text-xs font-bold text-emerald-300">
                            {deck.totalCards}
                          </div>
                          <div className="text-[10px] opacity-70">Total</div>
                        </div>
                      </div>

                      {/* Card Action Buttons */}
                      <div className="flex items-center gap-2 pt-1">
                        <M3Button
                          variant="filled"
                          size="sm"
                          onClick={() => onStartStudy(deck.id)}
                          icon={<Play className="w-4 h-4 fill-current" />}
                          className="flex-1 bg-indigo-600 hover:bg-indigo-500 font-bold"
                        >
                          Estudar
                        </M3Button>

                        <button
                          onClick={() => onManageCards(deck.id)}
                          className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold border border-white/10 transition-colors"
                          title="Gerenciar Cartões"
                        >
                          Cartões
                        </button>
                      </div>
                    </M3Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Criar Baralho Médico Customizado & Responsivo (Bottom Sheet em Mobile) */}
      <M3Modal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
        title="Criar Novo Baralho Médico"
        icon={<FolderPlus className="w-6 h-6 text-cyan-400" />}
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold mb-1 opacity-80">Título do Baralho</label>
            <input
              type="text"
              required
              placeholder="Ex: Endocrinologia - Diabetes & Tireoide"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.outline,
                color: colors.onSurface,
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1 opacity-80">Descrição / Ementa</label>
            <textarea
              rows={2}
              placeholder="Ex: Critérios de diagnóstico da ADA, metas glicêmicas e nódulos de tireoide."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.outline,
                color: colors.onSurface,
              }}
            />
          </div>

          {/* COMBOBOX CUSTOMIZADO & GRID ICON PICKER */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <M3Combobox
              label="Especialidade / Disciplina"
              groups={CURRICULUM_GROUPS}
              value={newCategory}
              onChange={handleCategoryChangeForNew}
              searchPlaceholder="Filtrar especialidades..."
            />

            <M3IconPicker
              label="Ícone Representativo"
              value={newIcon}
              onChange={setNewIcon}
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1 opacity-80">Pasta (Opcional)</label>
            <input
              type="text"
              placeholder="Ex: ClinicaMedica (ou deixe em branco)"
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.outline,
                color: colors.onSurface,
              }}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
            <M3Button type="button" variant="text" onClick={handleCloseCreateModal}>
              Cancelar
            </M3Button>
            <M3Button
              type="submit"
              variant="filled"
              disabled={isSubmittingCreate}
              className="bg-indigo-600 hover:bg-indigo-500 font-bold px-5"
            >
              {isSubmittingCreate ? 'Criando...' : 'Criar Baralho'}
            </M3Button>
          </div>
        </form>
      </M3Modal>

      {/* Modal Editar Baralho Médico */}
      <M3Modal
        isOpen={!!editingDeck}
        onClose={() => setEditingDeck(null)}
        title="Editar Baralho Médico"
        icon={<Edit3 className="w-6 h-6 text-indigo-400" />}
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold mb-1 opacity-80">Título do Baralho</label>
            <input
              type="text"
              required
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.outline,
                color: colors.onSurface,
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1 opacity-80">Descrição / Ementa</label>
            <textarea
              rows={2}
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.outline,
                color: colors.onSurface,
              }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <M3Combobox
              label="Especialidade / Disciplina"
              groups={CURRICULUM_GROUPS}
              value={editCategory}
              onChange={handleCategoryChangeForEdit}
              searchPlaceholder="Filtrar especialidades..."
            />

            <M3IconPicker
              label="Ícone Representativo"
              value={editIcon}
              onChange={setEditIcon}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
            <M3Button type="button" variant="text" onClick={() => setEditingDeck(null)}>
              Cancelar
            </M3Button>
            <M3Button
              type="submit"
              variant="filled"
              disabled={isSubmittingEdit}
              className="bg-indigo-600 hover:bg-indigo-500 font-bold px-5"
            >
              {isSubmittingEdit ? 'Salvando...' : 'Salvar Alterações'}
            </M3Button>
          </div>
        </form>
      </M3Modal>

      {/* Modal Mover Baralho */}
      <M3Modal
        isOpen={!!movingDeck}
        onClose={() => setMovingDeck(null)}
        title="Mover Baralho"
        icon={<FolderInput className="w-6 h-6 text-cyan-400" />}
        maxWidth="max-w-sm"
      >
        <form onSubmit={handleMoveSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold mb-1 opacity-80">
              Nome da Pasta Destino
            </label>
            <input
              type="text"
              placeholder="Ex: ClinicaMedica (deixe vazio para raiz)"
              value={targetFolder}
              onChange={(e) => setTargetFolder(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.outline,
                color: colors.onSurface,
              }}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
            <M3Button type="button" variant="text" onClick={() => setMovingDeck(null)}>
              Cancelar
            </M3Button>
            <M3Button type="submit" variant="filled" className="bg-indigo-600 hover:bg-indigo-500 font-bold px-5">
              Mover
            </M3Button>
          </div>
        </form>
      </M3Modal>
    </div>
  );
});
DeckListView.displayName = 'DeckListView';
