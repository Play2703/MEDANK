import { KnowledgeCategory } from '../../core/medcore_kernel/ontology/KnowledgeCategoryMapper';

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface KnowledgeAssetFile {
  name: string;
  url?: string;
  size?: number;
  type?: string;
  extension?: string;
  extractedText?: string;
  rawFileStorageKey?: string;
  hasRawFileBlob?: boolean;
}

export interface KnowledgeAssetFileBinary {
  id: string; // ID único que referencia o assetId
  assetId: string;
  blob: Blob;
  mimeType: string;
  createdAt: string;
}

export interface KnowledgeAsset {
  id: string;
  uuid: string;
  title: string;
  category: KnowledgeCategory;
  subcategory: string;
  discipline: string;
  specialty: string;
  author: string;
  institution: string;
  board: string;
  professor: string;
  year: number;
  semester: string;
  tags: string[];
  metadata: Record<string, any>;
  file: KnowledgeAssetFile;
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
  processingStatus: ProcessingStatus;
}
