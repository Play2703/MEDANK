import { useRiverpodState, useRiverpodNotifier } from '../../core/riverpod';
import { aiGeneratorRiverpodProvider } from './aiGeneratorRiverpodStore';
import { FlashCard, CardDifficulty, CardType } from '../../domain/entities/Card';
import { FlashcardGenerationMode, FlashcardGenerationLevel } from '../../domain/entities/DocumentImport';

export function useAIGeneratorViewModel() {
  const state = useRiverpodState(aiGeneratorRiverpodProvider);
  const notifier = useRiverpodNotifier(aiGeneratorRiverpodProvider);

  // Filter preview cards according to search and filters
  const filteredPreviewCards = state.generatedCards.filter((card) => {
    const q = state.previewSearchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      card.front.toLowerCase().includes(q) ||
      card.back.toLowerCase().includes(q) ||
      (card.hint && card.hint.toLowerCase().includes(q)) ||
      card.tags.some((t) => t.toLowerCase().includes(q));

    const matchesDifficulty =
      state.previewDifficultyFilter === 'Todas' || card.difficulty === state.previewDifficultyFilter;

    const matchesType =
      state.previewTypeFilter === 'Todas' || card.type === state.previewTypeFilter;

    return matchesSearch && matchesDifficulty && matchesType;
  });

  return {
    // State
    medicalText: state.medicalText,
    setMedicalText: (text: string) => notifier.setMedicalText(text),

    userInstructions: state.userInstructions,
    setUserInstructions: (instructions: string) => notifier.setUserInstructions(instructions),

    importedFiles: state.importedFiles,
    addFiles: (files: File[]) => notifier.addFiles(files),
    removeFile: (id: string) => notifier.removeFile(id),
    clearFiles: () => notifier.clearFiles(),

    subject: state.subject,
    setSubject: (s: string) => notifier.setSubject(s),

    examBoard: state.examBoard,
    setExamBoard: (b: string) => notifier.setExamBoard(b),

    professor: state.professor,
    setProfessor: (p: string) => notifier.setProfessor(p),

    cardCount: state.cardCount,
    setCardCount: (count: number) => notifier.setCardCount(count),

    cardType: state.cardType,
    setCardType: (type: FlashcardGenerationMode) => notifier.setCardType(type),

    level: state.level,
    setLevel: (lvl: FlashcardGenerationLevel) => notifier.setLevel(lvl),

    targetDeckId: state.targetDeckId,
    setTargetDeckId: (id: string) => notifier.setTargetDeckId(id),

    generatedCards: state.generatedCards,
    filteredPreviewCards,
    isReadingFiles: state.isReadingFiles,
    isGenerating: state.isGenerating,
    error: state.error,
    successMsg: state.successMsg,

    // Preview Filters & Search
    previewSearchQuery: state.previewSearchQuery,
    setPreviewSearchQuery: (q: string) => notifier.setPreviewSearchQuery(q),

    previewDifficultyFilter: state.previewDifficultyFilter,
    setPreviewDifficultyFilter: (d: CardDifficulty | 'Todas') => notifier.setPreviewDifficultyFilter(d),

    previewTypeFilter: state.previewTypeFilter,
    setPreviewTypeFilter: (t: CardType | 'Todas') => notifier.setPreviewTypeFilter(t),

    // Modal Edit State
    editingCard: state.editingCard,
    setEditingCard: (card: FlashCard | null) => notifier.setEditingCard(card),
    updatePreviewCard: (card: FlashCard) => notifier.updatePreviewCard(card),

    // Single Card Regeneration
    regeneratingCardId: state.regeneratingCardId,
    regenerateSingleCard: (id: string) => notifier.regenerateSingleCard(id),

    // Actions
    handleSelectFilesFromDevice: () => notifier.handleSelectFilesFromDevice(),
    handleGenerate: () => notifier.handleGenerateCards(),
    handleSaveGeneratedCards: () => notifier.handleSaveGeneratedCards(),
    removeCardFromPreview: (id: string) => notifier.removeCardFromPreview(id),
  };
}
