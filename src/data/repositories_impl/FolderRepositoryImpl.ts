import { IFolderRepository } from '../../domain/repositories/IFolderRepository';
import { Folder } from '../../domain/entities/Folder';
import { db, MedAnkiDexieDB } from '../db/database';

export class FolderRepositoryImpl implements IFolderRepository {
  constructor(private database: MedAnkiDexieDB = db) {}

  async getAllFolders(): Promise<Folder[]> {
    return await this.database.folders.toArray();
  }

  async getFolderById(id: string): Promise<Folder | null> {
    const folder = await this.database.folders.get(id);
    return folder || null;
  }

  async createFolder(folderData: Omit<Folder, 'id' | 'createdAt' | 'updatedAt'>): Promise<Folder> {
    const now = new Date().toISOString();
    const newFolder: Folder = {
      ...folderData,
      id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: now,
      updatedAt: now,
    };
    await this.database.folders.put(newFolder);
    return newFolder;
  }

  async updateFolder(folder: Folder): Promise<Folder> {
    const updatedFolder: Folder = {
      ...folder,
      updatedAt: new Date().toISOString(),
    };
    await this.database.folders.put(updatedFolder);
    return updatedFolder;
  }

  async deleteFolder(id: string): Promise<boolean> {
    await this.database.folders.delete(id);
    return true;
  }

  async getFoldersByParent(parentId?: string): Promise<Folder[]> {
    if (!parentId) {
      return await this.database.folders.filter((f) => !f.parentId).toArray();
    }
    return await this.database.folders.where('parentId').equals(parentId).toArray();
  }
}
