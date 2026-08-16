import { ExamProfile, ProfessorProfile, QuestionSet } from '../entities/Question';

export interface ImportedOriginSummary {
  name: string;
  chunkCount: number;
  type: 'banca' | 'professor';
}

export interface KnowledgeBaseStats {
  totalDocuments: number;
  totalChunks: number;
}

export interface IQuestionRepository {
  getExamProfiles(): Promise<ExamProfile[]>;
  getProfessorProfiles(): Promise<ProfessorProfile[]>;
  getImportedOrigins(): Promise<ImportedOriginSummary[]>;
  getKnowledgeBaseStats(): Promise<KnowledgeBaseStats>;
  getProfessorProfileById(id: string): Promise<ProfessorProfile | null>;
  saveProfessorProfile(profile: ProfessorProfile): Promise<ProfessorProfile>;
  deleteProfessorProfile(id: string): Promise<boolean>;
  getQuestionSets(): Promise<QuestionSet[]>;
  getQuestionSetById(id: string): Promise<QuestionSet | null>;
  saveQuestionSet(set: QuestionSet): Promise<QuestionSet>;
  deleteQuestionSet(id: string): Promise<boolean>;
  findExistingQuestionsByTopic(
    specialty: string,
    topic: string,
    subtopic?: string,
    limit?: number
  ): Promise<import('../entities/Question').Question[]>;
}
