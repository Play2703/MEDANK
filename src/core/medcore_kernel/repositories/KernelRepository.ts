import { materialRepository } from '../../material/repositories/MaterialRepository';
import { MaterialModel } from '../../material/models/MaterialModel';

export class KernelRepository {
  private static instance: KernelRepository;

  private constructor() {}

  public static getInstance(): KernelRepository {
    if (!KernelRepository.instance) {
      KernelRepository.instance = new KernelRepository();
    }
    return KernelRepository.instance;
  }

  public async getAllDocuments(): Promise<MaterialModel[]> {
    return await materialRepository.getAllMaterials();
  }

  public async getDocumentById(id: string): Promise<MaterialModel | null> {
    const materials = await materialRepository.getAllMaterials();
    return materials.find((m) => m.id === id) || null;
  }

  public async saveDocument(material: any): Promise<MaterialModel> {
    return await materialRepository.createMaterial(material);
  }

  public async updateDocument(id: string, partial: any): Promise<void> {
    await materialRepository.updateMaterial(id, partial);
  }

  public async deleteDocument(id: string): Promise<void> {
    await materialRepository.deleteMaterial(id);
  }

  public async searchKnowledge(query: string): Promise<MaterialModel[]> {
    const materials = await materialRepository.getAllMaterials();
    const lower = query.toLowerCase();
    return materials.filter(
      (m) =>
        m.titulo.toLowerCase().includes(lower) ||
        m.categoria.toLowerCase().includes(lower) ||
        m.disciplina.toLowerCase().includes(lower) ||
        m.especialidade.toLowerCase().includes(lower)
    );
  }
}

export const kernelRepository = KernelRepository.getInstance();
