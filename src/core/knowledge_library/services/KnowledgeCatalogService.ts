/**
 * Knowledge Library Module - KnowledgeCatalogService
 *
 * Provides taxonomy catalogs, medical specialties, disciplines, tags, authors, and institutions.
 */

import {
  IKnowledgeCatalogService,
  MedicalSpecialtyCatalogItem,
  MedicalDisciplineCatalogItem,
} from '../interfaces/IKnowledgeCatalogService';
import { IKnowledgeLibraryRepository } from '../interfaces/IKnowledgeLibraryRepository';
import { KnowledgeCategory, KNOWLEDGE_CATEGORIES } from '../models/KnowledgeCategory';
import { KnowledgeTag } from '../models/KnowledgeTag';
import { KnowledgeAuthor } from '../models/KnowledgeAuthor';
import { KnowledgeInstitution } from '../models/KnowledgeInstitution';

const PREDEFINED_SPECIALTIES: MedicalSpecialtyCatalogItem[] = [
  { id: 'spec-cardio', name: 'Cardiologia', code: 'CARD' },
  { id: 'spec-pedia', name: 'Pediatria', code: 'PED' },
  { id: 'spec-go', name: 'Ginecologia e Obstetrícia', code: 'GO' },
  { id: 'spec-infecto', name: 'Infectologia', code: 'INF' },
  { id: 'spec-cirurgia', name: 'Cirurgia Geral', code: 'CIR' },
  { id: 'spec-clinica', name: 'Clínica Médica', code: 'CLM' },
  { id: 'spec-prev', name: 'Preventiva e Saúde Coletiva', code: 'PREV' },
  { id: 'spec-nefno', name: 'Nefrologia', code: 'NEF' },
  { id: 'spec-pneumo', name: 'Pneumologia', code: 'PNE' },
  { id: 'spec-gastro', name: 'Gastroenterologia', code: 'GAS' },
  { id: 'spec-neuro', name: 'Neurologia', code: 'NEU' },
  { id: 'spec-endo', name: 'Endocrinologia', code: 'END' },
  { id: 'spec-derma', name: 'Dermatologia', code: 'DER' },
  { id: 'spec-ortho', name: 'Ortopedia e Traumatologia', code: 'ORT' },
  { id: 'spec-uti', name: 'Medicina Intensiva e Emergência', code: 'UTI' },
  { id: 'spec-psiquia', name: 'Psiquiatria', code: 'PSI' },
];

const PREDEFINED_DISCIPLINES: MedicalDisciplineCatalogItem[] = [
  { id: 'disc-clinica', name: 'Clínica Médica', area: 'Clínica' },
  { id: 'disc-cirurgia', name: 'Cirurgia Geral', area: 'Cirúrgica' },
  { id: 'disc-pediatria', name: 'Pediatria', area: 'Pediátrica' },
  { id: 'disc-go', name: 'Ginecologia e Obstetrícia', area: 'Maternal-Infantil' },
  { id: 'disc-preventiva', name: 'Medicina Preventiva e Social', area: 'Saúde Pública' },
  { id: 'disc-farmaco', name: 'Farmacologia Clínica', area: 'Básica' },
  { id: 'disc-propedeutica', name: 'Propedêutica e Semiologia Médica', area: 'Básica' },
];

export class KnowledgeCatalogService implements IKnowledgeCatalogService {
  constructor(private readonly repository: IKnowledgeLibraryRepository) {}

  public async getSpecialties(): Promise<MedicalSpecialtyCatalogItem[]> {
    return [...PREDEFINED_SPECIALTIES];
  }

  public async getDisciplines(): Promise<MedicalDisciplineCatalogItem[]> {
    return [...PREDEFINED_DISCIPLINES];
  }

  public getCategories(): KnowledgeCategory[] {
    return Object.values(KnowledgeCategory) as KnowledgeCategory[];
  }

  public async getTags(): Promise<KnowledgeTag[]> {
    return this.repository.getTags();
  }

  public async addTag(name: string, color?: string): Promise<KnowledgeTag> {
    return this.repository.createTag(name, color);
  }

  public async getAuthors(): Promise<KnowledgeAuthor[]> {
    return this.repository.getAuthors();
  }

  public async getInstitutions(): Promise<KnowledgeInstitution[]> {
    return this.repository.getInstitutions();
  }
}
