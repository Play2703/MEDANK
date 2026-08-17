/**
 * Knowledge Library Module - KnowledgeLibraryProvider
 *
 * StateNotifier & Riverpod provider managing Knowledge Library UI state,
 * search filters, registration workflow, modal overlays, and stats calculations.
 */

import { StateNotifier, stateNotifierProvider, StateNotifierProvider } from '../../riverpod';
import { KnowledgeLibraryItem, KnowledgeCategory, KnowledgeStatus } from '../models';
import { LibraryStats } from '../interfaces/ILibraryService';
import { KnowledgeLibraryRepository } from '../repositories/KnowledgeLibraryRepository';
import { LibraryService } from '../services/LibraryService';
import { DocumentRegistrationService } from '../services/DocumentRegistrationService';
import { KnowledgeCatalogService } from '../services/KnowledgeCatalogService';
import { DeveloperLibraryService } from '../services/DeveloperLibraryService';
import { FileImportPayload } from '../interfaces/IDocumentRegistrationService';
import { MedicalSpecialtyCatalogItem, MedicalDisciplineCatalogItem } from '../interfaces/IKnowledgeCatalogService';
import { medKnowledgeRepository } from '../../../data/repositories_impl/MedKnowledgeRepository';

export interface KnowledgeLibraryFilterState {
  type: KnowledgeCategory | 'Todos';
  specialty: string;
  discipline: string;
  status: KnowledgeStatus | 'Todos';
  format: string;
}

export interface KnowledgeLibraryUIState {
  items: KnowledgeLibraryItem[];
  stats: LibraryStats | null;
  selectedItem: KnowledgeLibraryItem | null;
  activeCategoryTab: KnowledgeCategory | 'Todas';
  searchQuery: string;
  filters: KnowledgeLibraryFilterState;
  specialtiesCatalog: MedicalSpecialtyCatalogItem[];
  disciplinesCatalog: MedicalDisciplineCatalogItem[];
  isImportModalOpen: boolean;
  isDetailModalOpen: boolean;
  stagedImportFiles: FileImportPayload[];
  isLoading: boolean;
  error?: string;
}

export class KnowledgeLibraryNotifier extends StateNotifier<KnowledgeLibraryUIState> {
  private repository: KnowledgeLibraryRepository;
  private libraryService: LibraryService;
  private registrationService: DocumentRegistrationService;
  private catalogService: KnowledgeCatalogService;
  private developerLibraryService: DeveloperLibraryService;

  constructor() {
    const repository = new KnowledgeLibraryRepository();
    const libraryService = new LibraryService(repository);
    const registrationService = new DocumentRegistrationService(repository);
    const catalogService = new KnowledgeCatalogService(repository);
    const developerLibraryService = new DeveloperLibraryService(
      libraryService,
      registrationService,
      catalogService
    );

    super({
      items: [],
      stats: null,
      selectedItem: null,
      activeCategoryTab: 'Todas',
      searchQuery: '',
      filters: {
        type: 'Todos',
        specialty: 'Todas',
        discipline: 'Todas',
        status: 'Todos',
        format: 'Todos',
      },
      specialtiesCatalog: [],
      disciplinesCatalog: [],
      isImportModalOpen: false,
      isDetailModalOpen: false,
      stagedImportFiles: [],
      isLoading: true,
    });

    this.repository = repository;
    this.libraryService = libraryService;
    this.registrationService = registrationService;
    this.catalogService = catalogService;
    this.developerLibraryService = developerLibraryService;

    this.initializeData();

    medKnowledgeRepository.subscribe(() => {
      this.initializeData();
    });
  }

  public async initializeData(): Promise<void> {
    this.state = { ...this.state, isLoading: true, error: undefined };
    try {
      const [items, stats, specialties, disciplines] = await Promise.all([
        this.developerLibraryService.fetchLibraryItems(),
        this.developerLibraryService.fetchStats(),
        this.catalogService.getSpecialties(),
        this.catalogService.getDisciplines(),
      ]);

      this.state = {
        ...this.state,
        items,
        stats,
        specialtiesCatalog: specialties,
        disciplinesCatalog: disciplines,
        isLoading: false,
      };
    } catch (err: any) {
      this.state = {
        ...this.state,
        isLoading: false,
        error: err?.message || 'Erro ao carregar Biblioteca do MedCore.',
      };
    }
  }

  public async applyFilters(): Promise<void> {
    this.state = { ...this.state, isLoading: true };
    try {
      const activeType =
        this.state.activeCategoryTab !== 'Todas'
          ? this.state.activeCategoryTab
          : this.state.filters.type;

      const filteredItems = await this.developerLibraryService.fetchLibraryItems({
        searchQuery: this.state.searchQuery,
        type: activeType,
        specialty: this.state.filters.specialty,
        discipline: this.state.filters.discipline,
        status: this.state.filters.status,
        format: this.state.filters.format,
      });

      this.state = {
        ...this.state,
        items: filteredItems,
        isLoading: false,
      };
    } catch (err: any) {
      this.state = {
        ...this.state,
        isLoading: false,
        error: err?.message || 'Erro ao filtrar itens.',
      };
    }
  }

  public setSearchQuery(query: string): void {
    this.state = { ...this.state, searchQuery: query };
    this.applyFilters();
  }

  public setActiveCategoryTab(category: KnowledgeCategory | 'Todas'): void {
    this.state = {
      ...this.state,
      activeCategoryTab: category,
      filters: {
        ...this.state.filters,
        type: category === 'Todas' ? 'Todos' : category,
      },
    };
    this.applyFilters();
  }

  public setFilter(key: keyof KnowledgeLibraryFilterState, value: string): void {
    this.state = {
      ...this.state,
      filters: {
        ...this.state.filters,
        [key]: value,
      },
    };
    this.applyFilters();
  }

  public resetFilters(): void {
    this.state = {
      ...this.state,
      searchQuery: '',
      activeCategoryTab: 'Todas',
      filters: {
        type: 'Todos',
        specialty: 'Todas',
        discipline: 'Todas',
        status: 'Todos',
        format: 'Todos',
      },
    };
    this.applyFilters();
  }

  /**
   * Stage raw browser Files for multi-file registration modal
   */
  public stageFilesForImport(files: FileList | File[]): void {
    const fileArray = Array.from(files);
    const staged: FileImportPayload[] = fileArray.map((file) => ({
      file,
      overrideName: file.name.replace(/\.[^/.]+$/, ''),
      category: this.inferCategoryFromFileName(file.name),
      specialties: ['Geral'],
      discipline: 'Geral',
      subject: 'Conhecimento Médico',
      subtopic: '',
      author: '',
      institution: '',
      year: new Date().getFullYear(),
      language: 'pt-BR',
      description: '',
      tags: [],
      notes: '',
      origin: 'Importador MedAnki',
    }));

    this.state = {
      ...this.state,
      stagedImportFiles: staged,
      isImportModalOpen: true,
    };
  }

  public updateStagedFile(index: number, partial: Partial<FileImportPayload>): void {
    const updated = [...this.state.stagedImportFiles];
    if (updated[index]) {
      updated[index] = { ...updated[index], ...partial };
      this.state = { ...this.state, stagedImportFiles: updated };
    }
  }

  public removeStagedFile(index: number): void {
    const updated = this.state.stagedImportFiles.filter((_, i) => i !== index);
    this.state = {
      ...this.state,
      stagedImportFiles: updated,
      isImportModalOpen: updated.length > 0,
    };
  }

  public closeImportModal(): void {
    this.state = {
      ...this.state,
      isImportModalOpen: false,
      stagedImportFiles: [],
    };
  }

  public async confirmStagedRegistration(): Promise<void> {
    if (this.state.stagedImportFiles.length === 0) return;

    this.state = { ...this.state, isLoading: true };
    try {
      await this.developerLibraryService.registerBatch(this.state.stagedImportFiles);
      const stats = await this.developerLibraryService.fetchStats();

      this.state = {
        ...this.state,
        isImportModalOpen: false,
        stagedImportFiles: [],
        stats,
      };

      await this.applyFilters();
    } catch (err: any) {
      this.state = {
        ...this.state,
        isLoading: false,
        error: err?.message || 'Erro ao registrar documentos.',
      };
    }
  }

  public selectItemForDetail(item: KnowledgeLibraryItem | null): void {
    this.state = {
      ...this.state,
      selectedItem: item,
      isDetailModalOpen: !!item,
    };
  }

  public closeDetailModal(): void {
    this.state = {
      ...this.state,
      selectedItem: null,
      isDetailModalOpen: false,
    };
  }

  public async updateItemDetails(
    id: string,
    updates: Partial<KnowledgeLibraryItem>
  ): Promise<void> {
    this.state = { ...this.state, isLoading: true };
    try {
      const updated = await this.developerLibraryService.editDocument(id, updates);
      const stats = await this.developerLibraryService.fetchStats();

      this.state = {
        ...this.state,
        selectedItem: updated,
        stats,
      };

      await this.applyFilters();
    } catch (err: any) {
      this.state = {
        ...this.state,
        isLoading: false,
        error: err?.message || 'Erro ao atualizar metadados.',
      };
    }
  }

  public async moveItemCategory(id: string, newCategory: KnowledgeCategory): Promise<void> {
    this.state = { ...this.state, isLoading: true };
    try {
      const updated = await this.developerLibraryService.moveDocumentCategory(id, newCategory);
      const stats = await this.developerLibraryService.fetchStats();

      this.state = {
        ...this.state,
        selectedItem: updated,
        stats,
      };

      await this.applyFilters();
    } catch (err: any) {
      this.state = {
        ...this.state,
        isLoading: false,
        error: err?.message || 'Erro ao mover categoria.',
      };
    }
  }

  public async duplicateItem(id: string): Promise<void> {
    this.state = { ...this.state, isLoading: true };
    try {
      const duplicated = await this.developerLibraryService.duplicateDocument(id);
      const stats = await this.developerLibraryService.fetchStats();

      this.state = {
        ...this.state,
        selectedItem: duplicated,
        stats,
      };

      await this.applyFilters();
    } catch (err: any) {
      this.state = {
        ...this.state,
        isLoading: false,
        error: err?.message || 'Erro ao duplicar cadastro.',
      };
    }
  }

  public async deleteItem(id: string): Promise<void> {
    this.state = { ...this.state, isLoading: true };
    try {
      await this.developerLibraryService.deleteDocument(id);
      const stats = await this.developerLibraryService.fetchStats();

      this.state = {
        ...this.state,
        selectedItem: null,
        isDetailModalOpen: false,
        stats,
      };

      await this.applyFilters();
    } catch (err: any) {
      this.state = {
        ...this.state,
        isLoading: false,
        error: err?.message || 'Erro ao excluir documento.',
      };
    }
  }

  public async resetToSeedData(): Promise<void> {
    this.state = { ...this.state, isLoading: true };
    try {
      await this.repository.resetToSeedData();
      const stats = await this.developerLibraryService.fetchStats();
      this.state = {
        ...this.state,
        stats,
      };
      await this.applyFilters();
    } catch (err: any) {
      this.state = {
        ...this.state,
        isLoading: false,
        error: err?.message || 'Erro ao restaurar dados padrão.',
      };
    }
  }

  private inferCategoryFromFileName(fileName: string): KnowledgeCategory {
    const lower = fileName.toLowerCase();
    if (lower.includes('prova') || lower.includes('exame') || lower.includes('enare') || lower.includes('usp') || lower.includes('questoes') || lower.includes('question') || lower.includes('banco')) return KnowledgeCategory.residencyExam;
    if (lower.includes('livro') || lower.includes('tratado') || lower.includes('harrison') || lower.includes('braunwald')) return KnowledgeCategory.book;
    if (lower.includes('prof') || lower.includes('aula') || lower.includes('curso')) return KnowledgeCategory.professorExam;
    if (lower.includes('diretriz') || lower.includes('consenso') || lower.includes('sbc')) return KnowledgeCategory.guideline;
    if (lower.includes('protocolo') || lower.includes('conduta') || lower.includes('uti')) return KnowledgeCategory.protocol;
    if (lower.includes('artigo') || lower.includes('nejm') || lower.includes('jama') || lower.includes('lancet')) return KnowledgeCategory.article;
    if (lower.includes('apostila') || lower.includes('resumo') || lower.includes('compendio')) return KnowledgeCategory.apostila;
    return KnowledgeCategory.other;
  }
}

export const knowledgeLibraryProvider: StateNotifierProvider<
  KnowledgeLibraryNotifier,
  KnowledgeLibraryUIState
> = stateNotifierProvider(() => new KnowledgeLibraryNotifier());
