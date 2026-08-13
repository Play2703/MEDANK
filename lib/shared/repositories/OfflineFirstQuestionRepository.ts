import { IQuestionRepository, ImportedOriginSummary } from '../../../src/domain/repositories/IQuestionRepository';
import { ExamProfile, ProfessorProfile, QuestionSet } from '../../../src/domain/entities/Question';
import { db } from '../../../src/data/db/database';

import {
  nativeSQLiteService,
  NativeSQLiteService,
  CachedQuestionRow,
} from '../../core/services/NativeSQLiteService';
import { syncService, SyncService } from '../../core/services/SyncService';

/**
 * Cache-then-Network Question Repository
 * 1. Reads local native SQLite cache FIRST for instant response.
 * 2. Immediately writes answers to SQLite and enqueues to Action Queue.
 */
export class OfflineFirstQuestionRepository implements IQuestionRepository {
  constructor(
    private sqlite: NativeSQLiteService = nativeSQLiteService,
    private sync: SyncService = syncService
  ) {}

  async getExamProfiles(): Promise<ExamProfile[]> {
    return await db.examProfiles.toArray();
  }

  async getProfessorProfiles(): Promise<ProfessorProfile[]> {
    return await db.professorProfiles.toArray();
  }

  async getImportedOrigins(): Promise<ImportedOriginSummary[]> {
    try {
      const allEmbeddings = await db.documentEmbeddings.toArray();
      const boardCounts = new Map<string, number>();
      const profCounts = new Map<string, number>();

      for (const emb of allEmbeddings) {
        if (emb.examBoard && emb.examBoard.trim()) {
          const bName = emb.examBoard.trim();
          boardCounts.set(bName, (boardCounts.get(bName) || 0) + 1);
        }
        if (emb.professor && emb.professor.trim()) {
          const pName = emb.professor.trim();
          profCounts.set(pName, (profCounts.get(pName) || 0) + 1);
        }
      }

      const results: ImportedOriginSummary[] = [];
      boardCounts.forEach((count, name) => {
        results.push({ name, chunkCount: count, type: 'banca' });
      });
      profCounts.forEach((count, name) => {
        results.push({ name, chunkCount: count, type: 'professor' });
      });

      return results;
    } catch (err) {
      console.warn('[OfflineFirstQuestionRepository] Error fetching imported origins:', err);
      return [];
    }
  }

  async getKnowledgeBaseStats(): Promise<{ totalDocuments: number; totalChunks: number }> {
    try {
      const allEmbeddings = await db.documentEmbeddings.toArray();
      const totalChunks = allEmbeddings.length;
      const uniqueAssetIds = new Set(allEmbeddings.map((e) => e.assetId));
      const totalDocuments = uniqueAssetIds.size;
      return { totalDocuments, totalChunks };
    } catch (err) {
      console.warn('[OfflineFirstQuestionRepository] Error fetching knowledge base stats:', err);
      return { totalDocuments: 0, totalChunks: 0 };
    }
  }

  async getProfessorProfileById(id: string): Promise<ProfessorProfile | null> {
    const profile = await db.professorProfiles.get(id);
    return profile || null;
  }

  async saveProfessorProfile(profile: ProfessorProfile): Promise<ProfessorProfile> {
    await db.professorProfiles.put(profile);
    return profile;
  }

  async deleteProfessorProfile(id: string): Promise<boolean> {
    await db.professorProfiles.delete(id);
    return true;
  }

  async getQuestionSets(): Promise<QuestionSet[]> {
    // Read from local database
    return await db.questionSets.orderBy('createdAt').reverse().toArray();
  }

  async getQuestionSetById(id: string): Promise<QuestionSet | null> {
    // 1. Check local cache
    const set = await db.questionSets.get(id);
    if (set) {
      // Hydrate questions into SQLite cache for fast sub-queries
      for (const q of set.questions) {
        await this.sqlite.upsertCachedQuestion({
          id: q.id,
          set_id: set.id,
          category: q.specialty || '',
          difficulty: q.difficulty || '',
          data_json: JSON.stringify(q),
          updated_at: new Date().toISOString(),
        });
      }
      return set;
    }
    return null;
  }

  async saveQuestionSet(set: QuestionSet): Promise<QuestionSet> {
    // 1. Cache questions to SQLite
    for (const q of set.questions) {
      await this.sqlite.upsertCachedQuestion({
        id: q.id,
        set_id: set.id,
        category: q.specialty || '',
        difficulty: q.difficulty || '',
        data_json: JSON.stringify(q),
        updated_at: new Date().toISOString(),
      });
    }

    // 2. Save in Dexie
    await db.questionSets.put(set);

    // 3. Enqueue for background sync
    await this.sync.enqueueAction('SAVE_QUESTION_SET', { set });

    return set;
  }

  async deleteQuestionSet(id: string): Promise<boolean> {
    await db.questionSets.delete(id);
    return true;
  }

  /**
   * Records user answering a question immediately into SQLite Action Queue
   */
  async recordAnswer(
    questionId: string,
    setId: string,
    selectedOptionId: string,
    isCorrect: boolean,
    metadata?: Record<string, any>
  ): Promise<void> {
    // 1. Enqueue action immediately in SQLite
    await this.sync.recordQuestionAnswer(
      questionId,
      setId,
      selectedOptionId,
      isCorrect,
      metadata
    );

    // 2. Update local Dexie question set state
    const set = await db.questionSets.get(setId);
    if (set) {
      const updatedQuestions = set.questions.map((q) => {
        if (q.id === questionId) {
          return {
            ...q,
            isAnswered: true,
            userAnswerId: selectedOptionId,
            isCorrect,
            answeredAt: new Date().toISOString(),
          };
        }
        return q;
      });

      const answeredCount = updatedQuestions.filter((q) => q.isAnswered).length;
      const correctCount = updatedQuestions.filter((q) => q.isCorrect).length;

      await db.questionSets.update(setId, {
        questions: updatedQuestions,
        answeredCount,
        correctCount,
        updatedAt: new Date().toISOString(),
      });
    }
  }
}
