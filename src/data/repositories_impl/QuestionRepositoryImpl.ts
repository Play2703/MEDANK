import { IQuestionRepository, ImportedOriginSummary } from '../../domain/repositories/IQuestionRepository';
import { ExamProfile, ProfessorProfile, QuestionSet } from '../../domain/entities/Question';
import { db } from '../db/database';

export class QuestionRepositoryImpl implements IQuestionRepository {
  async getExamProfiles(): Promise<ExamProfile[]> {
    return await db.examProfiles.toArray();
  }

  async getProfessorProfiles(): Promise<ProfessorProfile[]> {
    return await db.professorProfiles.toArray();
  }

  /**
   * Scans Dexie documentEmbeddings table to find real imported exam boards and professors with chunk counts
   */
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
      console.warn('[QuestionRepositoryImpl] Error fetching imported origins:', err);
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
      console.warn('[QuestionRepositoryImpl] Error fetching knowledge base stats:', err);
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
    return await db.questionSets.orderBy('createdAt').reverse().toArray();
  }

  async getQuestionSetById(id: string): Promise<QuestionSet | null> {
    const set = await db.questionSets.get(id);
    return set || null;
  }

  async saveQuestionSet(set: QuestionSet): Promise<QuestionSet> {
    await db.questionSets.put(set);
    return set;
  }

  async deleteQuestionSet(id: string): Promise<boolean> {
    await db.questionSets.delete(id);
    return true;
  }
}
