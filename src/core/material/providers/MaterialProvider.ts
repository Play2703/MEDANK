/**
 * MedCore Material Provider - Phase 18.1 & 18.2
 *
 * Provider singleton / factory for MaterialRepository.
 */

import { MaterialRepository } from '../repositories/MaterialRepository';

export class MaterialProvider {
  private static repositoryInstance: MaterialRepository;

  public static getRepository(): MaterialRepository {
    if (!this.repositoryInstance) {
      this.repositoryInstance = new MaterialRepository();
    }
    return this.repositoryInstance;
  }
}
