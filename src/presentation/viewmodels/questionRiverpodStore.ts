import { StateNotifier, stateNotifierProvider } from '../../core/riverpod';
import {
  ExamProfile,
  ProfessorProfile,
  Question,
  QuestionSet,
  QuestionGenerationRequest,
  QuestionConfiguration,
  GenerationMode,
  ImportedDocument,
} from '../../domain/entities/Question';
import { IQuestionRepository, ImportedOriginSummary } from '../../domain/repositories/IQuestionRepository';
import { RepositoryFactory } from '../../data/repositories_impl/RepositoryFactory';
import { QuestionGenerationService } from '../../data/services/QuestionGenerationService';
import { DocumentImportService } from '../../data/services/DocumentImportService';
import { DeckRepositoryImpl } from '../../data/repositories_impl/DeckRepositoryImpl';
import { FlashcardRepositoryImpl } from '../../data/repositories_impl/FlashcardRepositoryImpl';
import { medKnowledgeRepository, MedKnowledgeRepository } from '../../data/repositories_impl/MedKnowledgeRepository';
import { db } from '../../data/db/database';
import { knowledgeGraphService } from '../../data/services/KnowledgeGraphService';

export type QuestionViewStep = 'home' | 'generate' | 'profiles' | 'practice';

export interface LowChunkWarningState {
  lowChunks: boolean;
  chunkCount: number;
  bancaOrProf: string;
  topic: string;
  isGeneralMode?: boolean;
  pendingRequest?: QuestionGenerationRequest;
}

export interface QuestionState {
  examProfiles: ExamProfile[];
  professorProfiles: ProfessorProfile[];
  importedOrigins: ImportedOriginSummary[];
  knowledgeBaseStats: { totalDocuments: number; totalChunks: number };
  questionSets: QuestionSet[];
  activeQuestionSet: QuestionSet | null;
  loading: boolean;
  isGenerating: boolean;
  searchQuery: string;
  selectedMode: GenerationMode;
  currentStep: QuestionViewStep;
  activeProfileForEdit: ProfessorProfile | null;
  lowChunkWarning: LowChunkWarningState | null;
  prefilledConfiguration?: Partial<QuestionConfiguration> | null;
  generationShortfall: {
    setId: string;
    requested: number;
    actual: number;
    reason: string;
  } | null;
  error: string | null;
}

const initialQuestionState: QuestionState = {
  examProfiles: [],
  professorProfiles: [],
  importedOrigins: [],
  knowledgeBaseStats: { totalDocuments: 0, totalChunks: 0 },
  questionSets: [],
  activeQuestionSet: null,
  loading: true,
  isGenerating: false,
  searchQuery: '',
  selectedMode: 'geral',
  currentStep: 'home',
  activeProfileForEdit: null,
  lowChunkWarning: null,
  generationShortfall: null,
  error: null,
};

export class QuestionNotifier extends StateNotifier<QuestionState> {
  private repo: MedKnowledgeRepository;
  private repository: IQuestionRepository;
  private deckRepo: DeckRepositoryImpl;
  private flashcardRepo: FlashcardRepositoryImpl;
  private generationService: QuestionGenerationService;
  private importService: DocumentImportService;

  constructor() {
    super(initialQuestionState);
    this.repo = medKnowledgeRepository;
    this.repository = RepositoryFactory.getQuestionRepository();
    this.deckRepo = new DeckRepositoryImpl();
    this.flashcardRepo = new FlashcardRepositoryImpl();
    this.generationService = new QuestionGenerationService();
    this.importService = new DocumentImportService();
    this.loadAllData();
  }

  /**
   * Loads all exam profiles, professor profiles, real imported origins (from Dexie), knowledge base stats and question sets
   */
  async loadAllData(): Promise<void> {
    this.updateState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const examProfiles = await this.repository.getExamProfiles();
      const professorProfiles = await this.repository.getProfessorProfiles();
      const importedOrigins = await this.repository.getImportedOrigins();
      const knowledgeBaseStats = await this.repository.getKnowledgeBaseStats();
      const questionSets = await this.repository.getQuestionSets();

      this.updateState((prev) => ({
        ...prev,
        examProfiles,
        professorProfiles,
        importedOrigins,
        knowledgeBaseStats,
        questionSets,
        loading: false,
      }));
    } catch (err: any) {
      console.error('[QuestionNotifier] Error loading data:', err);
      this.updateState((prev) => ({
        ...prev,
        loading: false,
        error: 'Erro ao carregar dados do módulo de Questões.',
      }));
    }
  }

  setSearchQuery(query: string): void {
    this.updateState((prev) => ({ ...prev, searchQuery: query }));
  }

  setGenerationMode(mode: GenerationMode): void {
    this.updateState((prev) => ({ ...prev, selectedMode: mode }));
  }

  setCurrentStep(step: QuestionViewStep): void {
    this.updateState((prev) => ({ ...prev, currentStep: step }));
  }

  setActiveQuestionSet(set: QuestionSet | null): void {
    this.updateState((prev) => ({
      ...prev,
      activeQuestionSet: set,
      generationShortfall: set && prev.generationShortfall?.setId === set.id ? prev.generationShortfall : null,
    }));
  }

  setActiveProfileForEdit(profile: ProfessorProfile | null): void {
    this.updateState((prev) => ({ ...prev, activeProfileForEdit: profile }));
  }

  setPrefilledConfiguration(config: Partial<QuestionConfiguration> | null): void {
    this.updateState((prev) => ({ ...prev, prefilledConfiguration: config }));
  }

  clearLowChunkWarning(): void {
    this.updateState((prev) => ({ ...prev, lowChunkWarning: null }));
  }

  clearGenerationShortfall(): void {
    this.updateState((prev) => ({ ...prev, generationShortfall: null }));
  }

  /**
   * Professor Profile Management
   */
  async createProfessorProfile(
    name: string,
    description: string | undefined,
    importedDocs: ImportedDocument[]
  ): Promise<ProfessorProfile> {
    const profile: ProfessorProfile = {
      id: `prof-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name,
      description: description || 'Perfil de elaboração de provas criado por importação de arquivos.',
      documents: importedDocs,
      totalExamsCount: importedDocs.length,
      totalFilesSize: importedDocs.reduce((sum, doc) => sum + (doc.fileSize || 0), 0),
      formattedTotalSize: '0 KB',
      elaborationStyle: {
        writingStyle: 'Estilo Acadêmico baseados nos documentos importados',
        averageStatementLength: 'medio',
        difficultyDegree: 'media',
        clinicalCasesFrequency: 'Casos Clínicos',
        optionsPattern: '4 Alternativas',
        recurringThemes: ['Diretrizes Médicas', 'Casos Clínicos'],
        interdisciplinaryIntegration: 'Elevado',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = await this.repository.saveProfessorProfile(profile);
    await this.loadAllData();
    return saved;
  }

  async updateProfessorProfile(profile: ProfessorProfile): Promise<ProfessorProfile> {
    const saved = await this.repository.saveProfessorProfile(profile);
    await this.loadAllData();
    return saved;
  }

  async deleteProfessorProfile(id: string): Promise<boolean> {
    const deleted = await this.repository.deleteProfessorProfile(id);
    if (deleted) {
      await this.loadAllData();
    }
    return deleted;
  }

  /**
   * Generate Questions Architecture Trigger with Low Chunk Warning Handlers
   */
  async generateQuestions(request: QuestionGenerationRequest, forceProceed = false): Promise<QuestionSet | null> {
    this.updateState((prev) => ({ ...prev, isGenerating: true, error: null, lowChunkWarning: null }));
    try {
      const result = await this.generationService.generateQuestions(request, forceProceed);

      if (result.warning && !forceProceed) {
        this.updateState((prev) => ({
          ...prev,
          isGenerating: false,
          lowChunkWarning: {
            ...result.warning!,
            pendingRequest: request,
          },
        }));
        return null;
      }

      if (!result.questionSet) {
        throw new Error('Falha ao obter simulado gerado.');
      }

      const savedSet = await this.repository.saveQuestionSet(result.questionSet);

      if (request.configuration.autoGenerateFlashcards) {
        await this.exportQuestionsToFlashcards(savedSet.id);
      }

      const generationShortfall = result.shortfall
        ? {
            setId: savedSet.id,
            requested: result.shortfall.requested,
            actual: result.shortfall.actual,
            reason: result.shortfall.reason,
          }
        : null;

      await this.loadAllData();
      this.updateState((prev) => ({
        ...prev,
        activeQuestionSet: savedSet,
        currentStep: 'practice',
        isGenerating: false,
        lowChunkWarning: null,
        generationShortfall,
      }));

      return savedSet;
    } catch (err: any) {
      console.error('[QuestionNotifier] Error generating questions:', err);
      this.updateState((prev) => ({
        ...prev,
        isGenerating: false,
        error: err.message || 'Falha ao gerar o simulado de questões. Tente novamente.',
        lowChunkWarning: null,
      }));
      throw err;
    }
  }

  async confirmProceedWithLowChunks(): Promise<void> {
    const pendingReq = this.state.lowChunkWarning?.pendingRequest;
    if (pendingReq) {
      await this.generateQuestions(pendingReq, true);
    }
  }

  /**
   * Answer a question in an active set
   */
  async answerQuestion(setId: string, questionId: string, optionId: string): Promise<void> {
    const set = await this.repository.getQuestionSetById(setId);
    if (!set) return;

    const questionIndex = set.questions.findIndex((q) => q.id === questionId);
    if (questionIndex === -1) return;

    const targetQuestion = set.questions[questionIndex];
    if (targetQuestion.isAnswered) return;

    const isCorrect = optionId === targetQuestion.correctOptionId;
    const updatedQuestion = {
      ...targetQuestion,
      userAnswerId: optionId,
      isAnswered: true,
      isCorrect,
    };

    const updatedQuestions = [...set.questions];
    updatedQuestions[questionIndex] = updatedQuestion;

    const answeredCount = updatedQuestions.filter((q) => q.isAnswered).length;
    const correctCount = updatedQuestions.filter((q) => q.isCorrect).length;

    const isCompletedNow = answeredCount === updatedQuestions.length && !set.completedAt;

    const updatedSet: QuestionSet = {
      ...set,
      questions: updatedQuestions,
      answeredCount,
      correctCount,
      completedAt: isCompletedNow ? new Date().toISOString() : set.completedAt,
      updatedAt: new Date().toISOString(),
    };

    await this.repository.saveQuestionSet(updatedSet);

    if (!isCorrect) {
      this.recordWrongQuestionSignal(questionId).catch((err) =>
        console.warn('[questionRiverpodStore] Signal recording error:', err)
      );
    }

    if (isCompletedNow) {
      await this.exportWrongAnswersToMistakesDeck(updatedSet.id);
    }

    await this.loadAllData();

    if (this.state.activeQuestionSet?.id === setId) {
      this.updateState((prev) => ({ ...prev, activeQuestionSet: updatedSet }));
    }
  }

  private async recordWrongQuestionSignal(questionId: string): Promise<void> {
    try {
      const qLinks = await db.graphContentLinks
        .where('canonicalKey')
        .above('')
        .and((r) => r.contentType === 'question' && r.contentId === questionId)
        .toArray();

      let keys = qLinks.map((l) => l.canonicalKey);

      if (keys.length === 0) {
        const q = await db.questions.get(questionId);
        if (q && q.specialty) {
          keys = [q.specialty.toLowerCase().trim()];
          if (q.topic) keys.push(q.topic.toLowerCase().trim());
        }
      }

      if (keys.length === 0) return;

      const cardLinks = await db.graphContentLinks
        .where('contentType')
        .equals('flashcard')
        .and((l) => keys.includes(l.canonicalKey))
        .toArray();

      const linkedCardIds = new Set(cardLinks.map((l) => l.contentId));

      const allCards = await db.flashcards.toArray();
      for (const card of allCards) {
        if (card.canonicalKeys && card.canonicalKeys.some((k) => keys.includes(k))) {
          linkedCardIds.add(card.id);
        }
      }

      const now = new Date().toISOString();
      for (const cardId of linkedCardIds) {
        await db.cardSignals.put({
          id: `sig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          cardId,
          signalType: 'wrong_related_question',
          sourceId: questionId,
          weight: 1.5,
          createdAt: now,
          consumed: false,
        });
      }
    } catch (err) {
      console.warn('[questionRiverpodStore] Failed to record wrong_related_question signal:', err);
    }
  }

  /**
   * Exports only wrong answers from a completed QuestionSet into persistent "Meus Erros" deck
   */
  async exportWrongAnswersToMistakesDeck(questionSetId: string): Promise<string | null> {
    const set = await this.repository.getQuestionSetById(questionSetId);
    if (!set) return null;

    const wrongQuestions = set.questions.filter((q) => q.isAnswered && q.isCorrect === false);
    if (wrongQuestions.length === 0) return null;

    const existingDecks = await this.deckRepo.getAllDecks();
    let targetDeck = existingDecks.find((d) => d.title === 'Meus Erros');

    if (!targetDeck) {
      targetDeck = await this.deckRepo.createDeck({
        title: 'Meus Erros',
        description: 'Flashcards gerados automaticamente a partir de questões respondidas incorretamente em simulados.',
        category: 'Erros & Revisão',
        icon: 'AlertTriangle',
        color: '#EF4444',
        tags: ['Meus Erros', 'Revisão'],
      });
    }

    const existingCards = await db.flashcards.where('deckId').equals(targetDeck.id).toArray();
    const existingQuestionIds = new Set<string>();
    for (const card of existingCards) {
      if (Array.isArray(card.tags)) {
        for (const t of card.tags) {
          if (t.startsWith('q-')) {
            existingQuestionIds.add(t.substring(2));
          }
        }
      }
    }

    const now = new Date().toISOString();
    const newCards: any[] = [];

    for (const q of wrongQuestions) {
      if (existingQuestionIds.has(q.id)) continue;

      const correctOption = q.options.find((o) => o.id === q.correctOptionId);
      const userOption = q.options.find((o) => o.id === q.userAnswerId);

      const userResponseStr = userOption
        ? `Você respondeu: (${userOption.letter}) ${userOption.text}\n\n`
        : '';

      const commentaryText = typeof q.commentary === 'string'
        ? q.commentary
        : `${q.commentary.correta}${q.commentary.correlacaoClinica ? `\n\nCorrelação Clínica: ${q.commentary.correlacaoClinica}` : ''}`;

      const answerText = `${userResponseStr}A alternativa correta é (${correctOption?.letter || ''}): ${correctOption?.text || ''}\n\nComentário:\n${commentaryText}`;

      newCards.push({
        id: `card-mistake-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        deckId: targetDeck.id,
        type: 'basic',
        front: `${q.statement}\n\nAlternativas:\n${q.options.map((o) => `${o.letter}) ${o.text}`).join('\n')}`,
        back: answerText,
        highYield: true,
        tags: [q.specialty, q.topic, 'Meus Erros', 'Revisão', 'Errei', `q-${q.id}`],
        createdAt: now,
        updatedAt: now,
        sm2State: {
          repetition: 0,
          interval: 0,
          easeFactor: 2.5,
          dueDate: now,
        },
      });
    }

    if (newCards.length > 0) {
      await this.flashcardRepo.saveMultipleCards(newCards);
      await this.deckRepo.recalculateCounts(targetDeck.id);
    }

    return targetDeck.id;
  }

  async deleteQuestionSet(id: string): Promise<boolean> {
    const set = await this.repository.getQuestionSetById(id);
    const questionIds = set ? set.questions.map((q) => q.id) : [id];

    const deleted = await this.repository.deleteQuestionSet(id);
    if (deleted) {
      for (const qId of questionIds) {
        knowledgeGraphService.pruneOrphanedLinks('question', qId).catch((err) =>
          console.warn('[questionRiverpodStore] Failed to prune orphaned links:', err)
        );
      }
      if (this.state.activeQuestionSet?.id === id) {
        this.updateState((prev) => ({ ...prev, activeQuestionSet: null, currentStep: 'home' }));
      }
      await this.loadAllData();
    }
    return deleted;
  }

  /**
   * Converts generated questions into flashcards in MedAnki Deck System
   */
  async exportQuestionsToFlashcards(questionSetId: string): Promise<string> {
    const set = await this.repository.getQuestionSetById(questionSetId);
    if (!set) throw new Error('Simulado não encontrado.');

    const category = set.request.configuration.specialty || 'Questões';
    const deckTitle = `[Simulado] ${set.title}`;

    const existingDecks = await this.deckRepo.getAllDecks();
    let targetDeck = existingDecks.find((d) => d.title === deckTitle);

    if (!targetDeck) {
      targetDeck = await this.deckRepo.createDeck({
        title: deckTitle,
        description: `Flashcards gerados automaticamente a partir do simulado: ${set.title}`,
        category,
        icon: 'Brain',
        color: '#6366F1',
        tags: [category, 'Questões', 'Simulado'],
      });
    }

    const now = new Date().toISOString();
    const newCards: any[] = set.questions.map((q) => {
      const correctOption = q.options.find((o) => o.id === q.correctOptionId);
      const answerText = correctOption
        ? `A alternativa correta é (${correctOption.letter}): ${correctOption.text}\n\nComentário:\n${q.commentary}`
        : q.commentary;

      return {
        id: `card-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        deckId: targetDeck!.id,
        type: 'basic',
        front: `${q.statement}\n\nAlternativas:\n${q.options.map((o) => `${o.letter}) ${o.text}`).join('\n')}`,
        back: answerText,
        highYield: true,
        tags: [q.specialty, q.topic, 'Questões'],
        createdAt: now,
        updatedAt: now,
        sm2State: {
          repetition: 0,
          interval: 0,
          easeFactor: 2.5,
          dueDate: now,
        },
      };
    });

    await this.flashcardRepo.saveMultipleCards(newCards);
    await this.deckRepo.recalculateCounts(targetDeck.id);
    return targetDeck.id;
  }
}

export const questionRiverpodProvider = stateNotifierProvider<QuestionNotifier, QuestionState>(
  () => new QuestionNotifier()
);
