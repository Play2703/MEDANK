/**
 * Knowledge Library Module - IKnowledgeCatalogService
 *
 * Service contract managing taxonomy catalogs, specialties, disciplines, tags, and category taxonomies
 * used in document registration and filter dropdowns.
 */

import { KnowledgeCategory } from '../models/KnowledgeCategory';
import { KnowledgeTag } from '../models/KnowledgeTag';
import { KnowledgeAuthor } from '../models/KnowledgeAuthor';
import { KnowledgeInstitution } from '../models/KnowledgeInstitution';

export interface MedicalSpecialtyCatalogItem {
  id: string;
  name: string;
  code?: string;
}

export interface MedicalDisciplineCatalogItem {
  id: string;
  name: string;
  area?: string;
}

export interface IKnowledgeCatalogService {
  /** Get all predefined medical specialties for multi-select dropdowns */
  getSpecialties(): Promise<MedicalSpecialtyCatalogItem[]>;

  /** Get medical disciplines */
  getDisciplines(): Promise<MedicalDisciplineCatalogItem[]>;

  /** Get category taxonomy options */
  getCategories(): KnowledgeCategory[];

  /** Get available tags */
  getTags(): Promise<KnowledgeTag[]>;

  /** Register new tag in catalog */
  addTag(name: string, color?: string): Promise<KnowledgeTag>;

  /** Get authors catalog */
  getAuthors(): Promise<KnowledgeAuthor[]>;

  /** Get institutions catalog */
  getInstitutions(): Promise<KnowledgeInstitution[]>;
}
