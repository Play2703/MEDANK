import { IExtractedExamQuestionRepository } from '../../../src/domain/repositories/IExtractedExamQuestionRepository';
import { ExtractedExamQuestionRecord } from '../../../src/domain/entities/Question';
import {
  nativeSQLiteService,
  NativeSQLiteService,
  CachedExtractedExamQuestionRow,
} from '../../core/services/NativeSQLiteService';

export class OfflineFirstExtractedExamQuestionRepository implements IExtractedExamQuestionRepository {
  constructor(private sqlite: NativeSQLiteService = nativeSQLiteService) {}

  private rowToRecord(row: CachedExtractedExamQuestionRow): ExtractedExamQuestionRecord {
    let options: { letter: string; text: string }[] = [];
    try {
      options = JSON.parse(row.options_json || '[]');
    } catch {
      options = [];
    }

    return {
      id: row.id,
      sourceAssetId: row.source_asset_id || undefined,
      questionNumber: row.question_number,
      statement: row.statement,
      options,
      correctLetter: row.correct_letter || undefined,
      specialty: row.specialty || undefined,
      confidence: row.confidence,
      createdAt: row.created_at,
    };
  }

  private recordToRow(record: ExtractedExamQuestionRecord): CachedExtractedExamQuestionRow {
    return {
      id: record.id,
      source_asset_id: record.sourceAssetId || null,
      question_number: record.questionNumber,
      statement: record.statement,
      options_json: JSON.stringify(record.options || []),
      correct_letter: record.correctLetter || null,
      specialty: record.specialty || null,
      confidence: record.confidence,
      created_at: record.createdAt || new Date().toISOString(),
    };
  }

  async save(record: ExtractedExamQuestionRecord): Promise<void> {
    await this.sqlite.insertExtractedExamQuestion(this.recordToRow(record));
  }

  async bulkSave(records: ExtractedExamQuestionRecord[]): Promise<void> {
    if (records.length === 0) return;
    const rows = records.map((r) => this.recordToRow(r));
    await this.sqlite.bulkInsertExtractedExamQuestions(rows);
  }

  async getByAssetId(assetId: string): Promise<ExtractedExamQuestionRecord[]> {
    const rows = await this.sqlite.getExtractedExamQuestionsByAssetId(assetId);
    return rows.map((r) => this.rowToRecord(r));
  }

  async getAll(): Promise<ExtractedExamQuestionRecord[]> {
    const rows = await this.sqlite.getAllExtractedExamQuestions();
    return rows.map((r) => this.rowToRecord(r));
  }

  async getById(id: string): Promise<ExtractedExamQuestionRecord | null> {
    const row = await this.sqlite.getExtractedExamQuestionById(id);
    return row ? this.rowToRecord(row) : null;
  }

  async deleteByAssetId(assetId: string): Promise<void> {
    await this.sqlite.deleteExtractedExamQuestionsByAssetId(assetId);
  }

  async deleteById(id: string): Promise<void> {
    await this.sqlite.deleteExtractedExamQuestion(id);
  }

  async clear(): Promise<void> {
    await this.sqlite.clearExtractedExamQuestions();
  }
}
