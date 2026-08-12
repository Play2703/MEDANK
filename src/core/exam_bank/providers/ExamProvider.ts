/**
 * MedCore Exam Provider - Phase 18.4
 *
 * Singleton factory for ExamRepository.
 */

import { ExamRepository } from '../repositories/ExamRepository';

export class ExamProvider {
  private static repositoryInstance: ExamRepository;

  public static getRepository(): ExamRepository {
    if (!this.repositoryInstance) {
      this.repositoryInstance = new ExamRepository();
    }
    return this.repositoryInstance;
  }
}
