import { StateNotifier, stateNotifierProvider, StateNotifierProvider } from '../../riverpod';
import { ImportItem, ImportQueueState } from '../models/ImportModels';
import { ImportStatus } from '../models/ImportStatus';
import { medKnowledgeRepository } from '../../../data/repositories_impl/MedKnowledgeRepository';
import { KnowledgeCategory, KnowledgeCategoryMapper } from '../../knowledge_library/models/KnowledgeCategory';
import { DocumentReaderService } from '../services/DocumentReaderService';
import { MetadataExtractor } from '../services/MetadataExtractor';

export function getDestinationModule(category: KnowledgeCategory): string {
  switch (category) {
    case KnowledgeCategory.book: return 'Biblioteca do MedCore';
    case KnowledgeCategory.residencyExam: return 'Banco de Provas';
    case KnowledgeCategory.professorExam: return 'Banco de Professores';
    case KnowledgeCategory.questionBank: return 'Banco de Questões';
    case KnowledgeCategory.guideline: return 'Biblioteca de Diretrizes';
    case KnowledgeCategory.article: return 'Biblioteca Científica';
    case KnowledgeCategory.slide: return 'Biblioteca de Slides';
    case KnowledgeCategory.summary: return 'Biblioteca de Resumos';
    case KnowledgeCategory.flashcard: return 'Biblioteca de Flashcards';
    default: return 'Biblioteca Geral';
  }
}

export class ImportNotifier extends StateNotifier<ImportQueueState> {
  private processingInterval: any = null;
  private processedItemIds: Set<string> = new Set();

  constructor() {
    super({
      items: [],
      totalItems: 0,
      completedCount: 0,
      failedCount: 0,
      isProcessing: false,
    });
    this.startBackgroundProcessor();
  }

  public getState(): ImportQueueState {
    return this.state;
  }

  public setItems(items: ImportItem[]): void {
    this.recalculateState(items);
  }

  public enqueueItem(item: ImportItem): void {
    const existingIndex = this.state.items.findIndex((i) => i.id === item.id);
    let updatedItems: ImportItem[];

    if (existingIndex >= 0) {
      updatedItems = [...this.state.items];
      updatedItems[existingIndex] = item;
    } else {
      updatedItems = [...this.state.items, item];
    }

    this.recalculateState(updatedItems);
  }

  public addFiles(files: FileList | File[]): void {
    const newItems: ImportItem[] = Array.from(files).map((file) => {
      const ext = file.name.split('.').pop()?.toUpperCase() || 'PDF';
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-_]/g, ' ');
      const suggestedCat = KnowledgeCategoryMapper.fromFileName(file.name);

      return {
        id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        status: ImportStatus.Waiting,
        progress: 0,
        rawFile: file,
        categoriaSugerida: suggestedCat,
        categoriaManual: suggestedCat,
        titulo: baseName,
        ano: new Date().getFullYear(),
        tags: [ext, KnowledgeCategoryMapper.toDisplayName(suggestedCat), 'Import Center'],
        observacoes: 'Importado via Import Center',
        destino: getDestinationModule(suggestedCat),
        metadata: {
          origem: 'Upload Dispositivo',
          formato: ext,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });

    const updatedItems = [...this.state.items, ...newItems];
    this.recalculateState(updatedItems);
  }

  public updateItemMetadata(id: string, partial: Partial<ImportItem>): void {
    const updatedItems = this.state.items.map((item) => {
      if (item.id === id) {
        const updated = { ...item, ...partial, updatedAt: new Date().toISOString() };
        if (partial.categoriaManual) {
          updated.destino = getDestinationModule(partial.categoriaManual);
        }
        return updated;
      }
      return item;
    });
    this.recalculateState(updatedItems);
  }

  public updateItemStatus(
    id: string,
    status: ImportStatus,
    progress?: number,
    error?: string
  ): void {
    const updatedItems = this.state.items.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          status,
          progress: progress !== undefined ? progress : item.progress,
          error: error !== undefined ? error : item.error,
          updatedAt: new Date().toISOString(),
        };
      }
      return item;
    });

    this.recalculateState(updatedItems);
  }

  public cancelItem(id: string): void {
    this.updateItemStatus(id, ImportStatus.Cancelled, 0, 'Importação cancelada.');
  }

  public restartItem(id: string): void {
    this.updateItemStatus(id, ImportStatus.Validating, 0, undefined);
  }

  public moveItem(id: string, direction: 'up' | 'down'): void {
    const items = [...this.state.items];
    const index = items.findIndex((i) => i.id === id);
    if (index < 0) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const [movedItem] = items.splice(index, 1);
    items.splice(targetIndex, 0, movedItem);

    this.recalculateState(items);
  }

  public removeItem(id: string): void {
    const updatedItems = this.state.items.filter((item) => item.id !== id);
    this.recalculateState(updatedItems);
  }

  public clearQueue(): void {
    this.processedItemIds.clear();
    this.state = {
      items: [],
      activeItem: undefined,
      totalItems: 0,
      completedCount: 0,
      failedCount: 0,
      isProcessing: false,
    };
  }

  private startBackgroundProcessor(): void {
    if (this.processingInterval) return;

    this.processingInterval = setInterval(async () => {
      const waitingItem = this.state.items.find((i) => i.status === ImportStatus.Waiting);
      const activeItems = this.state.items.filter(
        (i) =>
          !i.isSaved &&
          !this.processedItemIds.has(i.id) &&
          (i.status === ImportStatus.Validating ||
            i.status === ImportStatus.Lendo ||
            i.status === ImportStatus.ExtraindoMetadados ||
            i.status === ImportStatus.Classificando ||
            i.status === ImportStatus.Organizando ||
            i.status === ImportStatus.Armazenando ||
            i.status === ImportStatus.ProcessandoRAG)
      );

      if (waitingItem && activeItems.length < 2) {
        this.updateItemStatus(waitingItem.id, ImportStatus.Validating, 15);
      }

      for (const item of activeItems) {
        if (item.isSaved || this.processedItemIds.has(item.id)) {
          continue;
        }

        let nextProgress = item.progress + 20;
        let nextStatus = item.status;

        if (item.status === ImportStatus.Validating && nextProgress >= 25) {
          nextStatus = ImportStatus.Lendo;
          if (item.rawFile && !item.extractedText) {
            try {
              const reader = new DocumentReaderService();
              const documentContent = await reader.readContent(item.rawFile, (p) => {
                this.updateItemStatus(item.id, ImportStatus.Lendo, 25 + Math.round((p / 100) * 15));
              });
              item.extractedText = documentContent.rawText || '';
            } catch (readErr) {
              console.warn(`[ImportProvider] Error reading raw file ${item.fileName}:`, readErr);
            }
          }
        } else if (item.status === ImportStatus.Lendo && nextProgress >= 45) {
          nextStatus = ImportStatus.ExtraindoMetadados;
          // Extrair metadados, incluindo contagem de páginas
          if (item.rawFile && item.paginas === undefined) {
            try {
              const metadataExtractor = new MetadataExtractor();
              const metadata = await metadataExtractor.extractMetadata(item.rawFile, item.extractedText);
              // Atribuir o número de páginas real extraído
              item.paginas = metadata.pageCount;
            } catch (metaErr) {
              console.warn(`[ImportProvider] Error extracting metadata for ${item.fileName}:`, metaErr);
              // Se não conseguir extrair, deixar paginas como undefined para a UI tratar honestamente
            }
          }
        } else if (item.status === ImportStatus.ExtraindoMetadados && nextProgress >= 65) {
          nextStatus = ImportStatus.Classificando;
        } else if (item.status === ImportStatus.Classificando && nextProgress >= 80) {
          nextStatus = ImportStatus.Organizando;
        } else if (item.status === ImportStatus.Organizando && nextProgress >= 90) {
          nextStatus = ImportStatus.Armazenando;
        } else if (item.status === ImportStatus.Armazenando && nextProgress >= 95) {
          nextStatus = ImportStatus.ProcessandoRAG;
          nextProgress = 95;
        } else if (item.status === ImportStatus.ProcessandoRAG) {
          if (item.isSaved || this.processedItemIds.has(item.id)) {
            continue;
          }
          item.isSaved = true;
          this.processedItemIds.add(item.id);

          nextStatus = ImportStatus.Finalizado;
          nextProgress = 100;

          // Save to MedKnowledgeRepository and generate RAG embeddings
          try {
            const effectiveCategory = item.categoriaManual || item.categoriaSugerida || KnowledgeCategory.other;
            const ext = item.metadata?.formato || item.fileName.split('.').pop()?.toUpperCase() || 'PDF';

            await medKnowledgeRepository.importAsset({
              title: item.titulo || item.fileName,
              category: effectiveCategory,
              discipline: item.disciplina || 'Clínica Médica',
              specialty: item.especialidade || 'Clínica Geral',
              author: item.professor || item.instituicao || 'Admin Import Center',
              institution: item.instituicao || undefined,
              board: item.banca ? item.banca.trim() : undefined,
              professor: item.professor ? item.professor.trim() : undefined,
              year: item.ano || new Date().getFullYear(),
              semester: item.semestre || undefined,
              tags: item.tags || [ext, KnowledgeCategoryMapper.toDisplayName(effectiveCategory)],
              metadata: {
                ...item.metadata,
                observacoes: item.observacoes,
                destino: item.destino,
              },
              file: {
                name: item.fileName,
                size: item.fileSize,
                type: item.mimeType,
                extension: ext,
                extractedText: item.extractedText && item.extractedText.trim().length > 0 ? item.extractedText : undefined,
              },
            });
          } catch (err) {
            console.error('Error saving imported document to MedKnowledgeRepository:', err);
          }
        }

        this.updateItemStatus(item.id, nextStatus, nextProgress);
      }
    }, 1000);
  }

  private recalculateState(items: ImportItem[]): void {
    const completedCount = items.filter((i) => i.status === ImportStatus.Finalizado).length;
    const failedCount = items.filter((i) => i.status === ImportStatus.Erro).length;
    const activeItem = items.find(
      (i) =>
        i.status === ImportStatus.Validating ||
        i.status === ImportStatus.Lendo ||
        i.status === ImportStatus.ExtraindoMetadados ||
        i.status === ImportStatus.Classificando ||
        i.status === ImportStatus.Organizando ||
        i.status === ImportStatus.Armazenando ||
        i.status === ImportStatus.ProcessandoRAG
    );
    const isProcessing = !!activeItem;

    this.state = {
      items,
      activeItem,
      totalItems: items.length,
      completedCount,
      failedCount,
      isProcessing,
    };
  }
}

export const importProvider: StateNotifierProvider<ImportNotifier, ImportQueueState> =
  stateNotifierProvider(() => new ImportNotifier());
