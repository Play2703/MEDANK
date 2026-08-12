import { ImportStatus } from './ImportStatus';
import { KnowledgeCategory } from '../../knowledge_library/models/KnowledgeCategory';

export interface ImportItem {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: ImportStatus;
  progress: number;
  isSaved?: boolean;
  paginas?: number;
  categoriaSugerida?: KnowledgeCategory;
  categoriaManual?: KnowledgeCategory;
  titulo?: string;
  instituicao?: string;
  professor?: string;
  banca?: string;
  ano?: number;
  semestre?: string;
  especialidade?: string;
  disciplina?: string;
  tags?: string[];
  observacoes?: string;
  destino?: string;
  rawFile?: File;
  extractedText?: string;
  metadata?: Record<string, any>;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportQueueState {
  items: ImportItem[];
  activeItem?: ImportItem;
  totalItems: number;
  completedCount: number;
  failedCount: number;
  isProcessing: boolean;
}
