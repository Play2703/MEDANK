import { IExtractedExamQuestionRepository } from '../../domain/repositories/IExtractedExamQuestionRepository';
import { ExtractedExamQuestionRecord } from '../../domain/entities/Question';
import { db } from '../db/database';

export class ExtractedExamQuestionRepositoryImpl implements IExtractedExamQuestionRepository {
  async save(record: ExtractedExamQuestionRecord): Promise<void> {
    await db.extractedExamQuestions.put(record);
  }

  async bulkSave(records: ExtractedExamQuestionRecord[]): Promise<void> {
    if (records.length === 0) return;
    await db.extractedExamQuestions.bulkPut(records);
  }

  async getByAssetId(assetId: string): Promise<ExtractedExamQuestionRecord[]> {
    return await db.extractedExamQuestions
      .where('sourceAssetId')
      .equals(assetId)
      .sortBy('questionNumber');
  }

  async getAll(): Promise<ExtractedExamQuestionRecord[]> {
    return await db.extractedExamQuestions.toArray();
  }

  async getById(id: string): Promise<ExtractedExamQuestionRecord | null> {
    const item = await db.extractedExamQuestions.get(id);
    return item || null;
  }

  async deleteByAssetId(assetId: string): Promise<void> {
    await db.extractedExamQuestions
      .where('sourceAssetId')
      .equals(assetId)
      .delete();
  }

  async deleteById(id: string): Promise<void> {
    await db.extractedExamQuestions.delete(id);
  }

  async clear(): Promise<void> {
    await db.extractedExamQuestions.clear();
  }
}
