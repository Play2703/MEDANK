import { ExtractedExamQuestionRecord } from '../entities/Question';

export interface IExtractedExamQuestionRepository {
  save(record: ExtractedExamQuestionRecord): Promise<void>;
  bulkSave(records: ExtractedExamQuestionRecord[]): Promise<void>;
  getByAssetId(assetId: string): Promise<ExtractedExamQuestionRecord[]>;
  getAll(): Promise<ExtractedExamQuestionRecord[]>;
  getById(id: string): Promise<ExtractedExamQuestionRecord | null>;
  deleteByAssetId(assetId: string): Promise<void>;
  deleteById(id: string): Promise<void>;
  clear(): Promise<void>;
}
