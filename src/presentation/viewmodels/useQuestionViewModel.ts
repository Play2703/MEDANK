import { useRiverpodState, useRiverpodNotifier } from '../../core/riverpod';
import { questionRiverpodProvider, QuestionViewStep } from './questionRiverpodStore';
import {
  GenerationMode,
  QuestionGenerationRequest,
  ProfessorProfile,
  ImportedDocument,
  QuestionSet,
} from '../../domain/entities/Question';

export function useQuestionViewModel() {
  const state = useRiverpodState(questionRiverpodProvider);
  const notifier = useRiverpodNotifier(questionRiverpodProvider);

  const importedExamBoards = state.importedOrigins.filter((o) => o.type === 'banca');
  const importedProfessors = state.importedOrigins.filter((o) => o.type === 'professor');

  return {
    // Reactive State
    examProfiles: state.examProfiles,
    professorProfiles: state.professorProfiles,
    importedOrigins: state.importedOrigins,
    importedExamBoards,
    importedProfessors,
    knowledgeBaseStats: state.knowledgeBaseStats,
    questionSets: state.questionSets,
    activeQuestionSet: state.activeQuestionSet,
    loading: state.loading,
    isGenerating: state.isGenerating,
    searchQuery: state.searchQuery,
    selectedMode: state.selectedMode,
    currentStep: state.currentStep,
    activeProfileForEdit: state.activeProfileForEdit,
    lowChunkWarning: state.lowChunkWarning,
    prefilledConfiguration: state.prefilledConfiguration,
    generationShortfall: state.generationShortfall,
    error: state.error,

    // Reactive Actions
    refresh: () => notifier.loadAllData(),
    setSearchQuery: (q: string) => notifier.setSearchQuery(q),
    setGenerationMode: (mode: GenerationMode) => notifier.setGenerationMode(mode),
    setCurrentStep: (step: QuestionViewStep) => notifier.setCurrentStep(step),
    setActiveQuestionSet: (set: QuestionSet | null) => notifier.setActiveQuestionSet(set),
    setActiveProfileForEdit: (profile: ProfessorProfile | null) => notifier.setActiveProfileForEdit(profile),
    setPrefilledConfiguration: (config: any) => notifier.setPrefilledConfiguration(config),
    clearLowChunkWarning: () => notifier.clearLowChunkWarning(),
    clearGenerationShortfall: () => notifier.clearGenerationShortfall(),
    confirmProceedWithLowChunks: () => notifier.confirmProceedWithLowChunks(),

    // Professor Profile CRUD Actions
    createProfessorProfile: (name: string, description: string | undefined, docs: ImportedDocument[]) =>
      notifier.createProfessorProfile(name, description, docs),
    updateProfessorProfile: (profile: ProfessorProfile) => notifier.updateProfessorProfile(profile),
    deleteProfessorProfile: (id: string) => notifier.deleteProfessorProfile(id),

    // Questions Generation & Interaction Actions
    generateQuestions: (req: QuestionGenerationRequest, forceProceed?: boolean) =>
      notifier.generateQuestions(req, forceProceed),
    answerQuestion: (setId: string, questionId: string, optionId: string) =>
      notifier.answerQuestion(setId, questionId, optionId),
    deleteQuestionSet: (setId: string) => notifier.deleteQuestionSet(setId),
    exportQuestionsToFlashcards: (setId: string) => notifier.exportQuestionsToFlashcards(setId),
    exportWrongAnswersToMistakesDeck: (setId: string) => notifier.exportWrongAnswersToMistakesDeck(setId),
  };
}
