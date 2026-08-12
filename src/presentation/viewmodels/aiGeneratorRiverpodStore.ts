import { StateNotifier, stateNotifierProvider } from '../../core/riverpod';
import { FlashCard, CardDifficulty, CardType } from '../../domain/entities/Card';
import {
  ImportedFile,
  FileImportStatus,
  FlashcardGenerationMode,
  FlashcardGenerationLevel,
  DocumentImportRecord,
} from '../../domain/entities/DocumentImport';
import { DocumentPickerService } from '../../data/services/DocumentPickerService';
import { DocumentImportService } from '../../data/services/DocumentImportService';
import { FlashcardGenerationService } from '../../data/services/FlashcardGenerationService';
import { medKnowledgeRepository, MedKnowledgeRepository } from '../../data/repositories_impl/MedKnowledgeRepository';
import { cardRiverpodProvider } from './cardRiverpodStore';
import { deckRiverpodProvider } from './deckRiverpodStore';

export interface AIGeneratorState {
  // Conteúdo de texto colado pelo usuário (compatibilidade retroativa com "Texto Médico")
  medicalText: string;
  // Instruções do usuário para direção/foco/nível (novo campo semântico)
  userInstructions: string;
  importedFiles: ImportedFile[];
  subject: string;
  examBoard: string; // Banca (ex: ENARE, Revalida, USP)
  professor: string; // Professor (ex: Prof. Santos)
  targetDeckId: string;
  cardCount: number;
  cardType: FlashcardGenerationMode;
  level: FlashcardGenerationLevel;
  isReadingFiles: boolean;
  isGenerating: boolean;
  error: string | null;
  successMsg: string | null;
  generatedCards: FlashCard[];
  previewSearchQuery: string;
  previewDifficultyFilter: CardDifficulty | 'Todas';
  previewTypeFilter: CardType | 'Todas';
  editingCard: FlashCard | null;
  regeneratingCardId: string | null;
}

const initialAIGeneratorState: AIGeneratorState = {
  medicalText: '',
  userInstructions: '',
  importedFiles: [],
  subject: 'Cardiologia',
  examBoard: '',
  professor: '',
  targetDeckId: '',
  cardCount: 5,
  cardType: 'mixed',
  level: 'intermediario',
  isReadingFiles: false,
  isGenerating: false,
  error: null,
  successMsg: null,
  generatedCards: [],
  previewSearchQuery: '',
  previewDifficultyFilter: 'Todas',
  previewTypeFilter: 'Todas',
  editingCard: null,
  regeneratingCardId: null,
};

export class AIGeneratorNotifier extends StateNotifier<AIGeneratorState> {
  private pickerService = new DocumentPickerService();
  private importService = new DocumentImportService();
  private generationService = new FlashcardGenerationService();
  private repo: MedKnowledgeRepository;

  constructor() {
    super(initialAIGeneratorState);
    this.repo = medKnowledgeRepository;
  }

  setMedicalText(text: string): void {
    this.updateState((prev) => ({ ...prev, medicalText: text, error: null }));
  }

  setUserInstructions(instructions: string): void {
    this.updateState((prev) => ({ ...prev, userInstructions: instructions, error: null }));
  }

  setSubject(subject: string): void {
    this.updateState((prev) => ({ ...prev, subject }));
  }

  setExamBoard(examBoard: string): void {
    this.updateState((prev) => ({ ...prev, examBoard }));
  }

  setProfessor(professor: string): void {
    this.updateState((prev) => ({ ...prev, professor }));
  }

  setTargetDeckId(deckId: string): void {
    this.updateState((prev) => ({ ...prev, targetDeckId: deckId, error: null }));
  }

  setCardCount(count: number): void {
    this.updateState((prev) => ({ ...prev, cardCount: count }));
  }

  setCardType(type: FlashcardGenerationMode): void {
    this.updateState((prev) => ({ ...prev, cardType: type }));
  }

  setLevel(level: FlashcardGenerationLevel): void {
    this.updateState((prev) => ({ ...prev, level }));
  }

  addFiles(files: File[]): void {
    const newItems = this.importService.createImportedFiles(files);
    this.updateState((prev) => ({
      ...prev,
      importedFiles: [...prev.importedFiles, ...newItems],
      error: null,
    }));
  }

  removeFile(id: string): void {
    this.updateState((prev) => ({
      ...prev,
      importedFiles: prev.importedFiles.filter((f) => f.id !== id),
    }));
  }

  clearFiles(): void {
    this.updateState((prev) => ({ ...prev, importedFiles: [] }));
  }

  setPreviewSearchQuery(query: string): void {
    this.updateState((prev) => ({ ...prev, previewSearchQuery: query }));
  }

  setPreviewDifficultyFilter(difficulty: CardDifficulty | 'Todas'): void {
    this.updateState((prev) => ({ ...prev, previewDifficultyFilter: difficulty }));
  }

  setPreviewTypeFilter(type: CardType | 'Todas'): void {
    this.updateState((prev) => ({ ...prev, previewTypeFilter: type }));
  }

  setEditingCard(card: FlashCard | null): void {
    this.updateState((prev) => ({ ...prev, editingCard: card }));
  }

  updatePreviewCard(updatedCard: FlashCard): void {
    this.updateState((prev) => ({
      ...prev,
      generatedCards: prev.generatedCards.map((c) => (c.id === updatedCard.id ? updatedCard : c)),
      editingCard: null,
    }));
  }

  removeCardFromPreview(id: string): void {
    this.updateState((prev) => ({
      ...prev,
      generatedCards: prev.generatedCards.filter((c) => c.id !== id),
    }));
  }

  async handleSelectFilesFromDevice(): Promise<void> {
    const selected = await this.pickerService.selectFilesFromDevice();
    if (selected.length > 0) {
      this.addFiles(selected);
    }
  }

  async handleGenerateCards(): Promise<void> {
    const { medicalText, userInstructions, importedFiles, targetDeckId, subject, examBoard, professor, cardCount, cardType, level } = this.state;

    // Validação: é preciso ter PELO MENOS UM de:
    // (a) texto/instrução preenchido (medicalText ou userInstructions)
    // (b) arquivo anexado
    // (c) Assunto/Especialidade preenchido (habilita busca na biblioteca via RAG)
    const hasTextOrInstructions = medicalText.trim().length > 0 || userInstructions.trim().length > 0;
    const hasFiles = importedFiles.length > 0;
    const hasSubject = subject && subject.trim().length > 0;

    if (!hasTextOrInstructions && !hasFiles && !hasSubject) {
      this.updateState((prev) => ({
        ...prev,
        error: 'Por favor, forneça pelo menos um de: (1) Instruções de Geração, (2) Arquivo de material, ou (3) Assunto/Especialidade para buscar na biblioteca.',
      }));
      return;
    }

    if (!targetDeckId) {
      this.updateState((prev) => ({
        ...prev,
        error: 'Por favor, selecione o baralho de destino.',
      }));
      return;
    }

    this.updateState((prev) => ({
      ...prev,
      isReadingFiles: true,
      isGenerating: true,
      error: null,
      successMsg: null,
    }));

    try {
      // Step 1: Process and read all files, passing examBoard and professor metadata for Dexie RAG indexing
      let extractedDocumentText = '';
      if (importedFiles.length > 0) {
        const fileResults = await this.importService.processAllFiles(
          importedFiles,
          (id, progress, status, text, errorMsg) => {
            this.updateState((prev) => ({
              ...prev,
              importedFiles: prev.importedFiles.map((f) =>
                f.id === id ? { ...f, progress, status, extractedText: text, errorMsg } : f
              ),
            }));
          },
          { examBoard, professor }
        );

        extractedDocumentText = fileResults
          .map((res) => `--- ARQUIVO: ${res.file.name} ---\n${res.text}`)
          .join('\n\n');
      }

      this.updateState((prev) => ({ ...prev, isReadingFiles: false }));

      // Step 2: Combine manual text + document text (compatibilidade com fluxo antigo)
      // Se há texto colado (medicalText), isso é tratado como conteúdo bruto
      const fullContext = [medicalText.trim(), extractedDocumentText].filter(Boolean).join('\n\n');

      // Step 3: Invoke FlashcardGenerationService with userInstructions separado
      // Se não há conteúdo nenhum mas há subject, o RAG vai buscar pela biblioteca
      const payload = {
        text: fullContext || '', // Pode estar vazio se só há subject
        userInstructions: userInstructions.trim() || undefined, // Opcional
        deckId: targetDeckId,
        subject,
        examBoard,
        professor,
        cardCount,
        cardType,
        level,
        filesInfo: importedFiles.map((f) => ({ name: f.name, type: f.type })),
      };

      const cards = await this.generationService.generateFlashcards(payload);

      this.updateState((prev) => ({
        ...prev,
        generatedCards: cards,
        isGenerating: false,
      }));
    } catch (err: any) {
      console.error('[AIGeneratorNotifier] Error generating cards:', err);
      this.updateState((prev) => ({
        ...prev,
        isReadingFiles: false,
        isGenerating: false,
        error: err.message || 'Falha ao processar materiais e gerar flashcards médicos.',
      }));
    }
  }

  async regenerateSingleCard(cardId: string): Promise<void> {
    const targetCard = this.state.generatedCards.find((c) => c.id === cardId);
    if (!targetCard) return;

    this.updateState((prev) => ({ ...prev, regeneratingCardId: cardId }));

    try {
      const combinedContext = [
        this.state.medicalText,
        ...this.state.importedFiles.map((f) => f.extractedText).filter(Boolean),
      ].join('\n\n');

      const updated = await this.generationService.regenerateSingleCard(
        targetCard,
        combinedContext,
        this.state.subject
      );

      this.updateState((prev) => ({
        ...prev,
        generatedCards: prev.generatedCards.map((c) => (c.id === cardId ? updated : c)),
        regeneratingCardId: null,
      }));
    } catch (err: any) {
      this.updateState((prev) => ({
        ...prev,
        regeneratingCardId: null,
        error: `Falha ao regenerar o card: ${err.message || 'Erro desconhecido'}`,
      }));
    }
  }

  async handleSaveGeneratedCards(): Promise<void> {
    const { generatedCards, targetDeckId } = this.state;
    if (generatedCards.length === 0 || !targetDeckId) return;

    try {
      await this.repo.bulkInsertCards(generatedCards);

      const cardStore = cardRiverpodProvider.notifier;
      const deckStore = deckRiverpodProvider.notifier;
      if (cardStore) await cardStore.loadCards(targetDeckId);
      if (deckStore) await deckStore.loadDecks();

      this.updateState((prev) => ({
        ...prev,
        successMsg: `Sucesso! ${generatedCards.length} flashcards médicos salvos no baralho com sucesso.`,
        generatedCards: [],
        medicalText: '',
        importedFiles: [],
      }));
    } catch (err: any) {
      console.error('[AIGeneratorNotifier] Error saving generated cards:', err);
      this.updateState((prev) => ({
        ...prev,
        error: 'Erro ao salvar os flashcards no baralho escolhido.',
      }));
    }
  }
}

export const aiGeneratorRiverpodProvider = stateNotifierProvider<AIGeneratorNotifier, AIGeneratorState>(
  () => new AIGeneratorNotifier()
);
