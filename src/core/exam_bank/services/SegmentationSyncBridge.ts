import { NativeSQLiteService, nativeSQLiteService } from '../../../../lib/core/services/NativeSQLiteService';
import { ExtractedExamQuestionRecord } from '../../../domain/entities/Question';

export class SegmentationSyncBridge {
  constructor(private sqlite: NativeSQLiteService = nativeSQLiteService) {}

  async syncSegmentedQuestions(assetId: string, questions: ExtractedExamQuestionRecord[]): Promise<void> {
    if (!questions || questions.length === 0) return;
    const rows = questions.map((q) => ({
      id: q.id,
      source_asset_id: assetId || q.sourceAssetId || null,
      question_number: q.questionNumber,
      statement: q.statement,
      options_json: JSON.stringify(q.options || []),
      correct_letter: q.correctLetter || null,
      specialty: q.specialty || null,
      confidence: q.confidence,
      created_at: q.createdAt || new Date().toISOString(),
    }));
    await this.sqlite.bulkInsertExtractedExamQuestions(rows);
  }
}

export const segmentationSyncBridge = new SegmentationSyncBridge();
