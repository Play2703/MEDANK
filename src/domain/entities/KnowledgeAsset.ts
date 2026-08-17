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

export interface ExamSegmentationStats {
  percent: number;
  level: 'ruim' | 'medio' | 'otimo';
  totalQuestions: number;
  highConfidenceCount: number;
  lowConfidenceCount: number;
  analyzedAt: string;
}

export function calculateSegmentationStats(
  totalQuestions: number,
  highConfidenceCount: number,
  lowConfidenceCount?: number
): ExamSegmentationStats {
  const lowCount =
    lowConfidenceCount !== undefined
      ? lowConfidenceCount
      : Math.max(0, totalQuestions - highConfidenceCount);
  const percent =
    totalQuestions > 0
      ? Math.round((highConfidenceCount / totalQuestions) * 1000) / 10
      : 0;

  let level: 'ruim' | 'medio' | 'otimo' = 'ruim';
  if (percent >= 80) {
    level = 'otimo';
  } else if (percent >= 50) {
    level = 'medio';
  } else {
    level = 'ruim';
  }

  return {
    percent,
    level,
    totalQuestions,
    highConfidenceCount,
    lowConfidenceCount: lowCount,
    analyzedAt: new Date().toISOString(),
  };
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
  metadata: Record<string, any> & {
    examSegmentationStats?: ExamSegmentationStats;
  };
  file: KnowledgeAssetFile;
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
  processingStatus: ProcessingStatus;
}
