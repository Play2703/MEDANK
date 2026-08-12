import { Folder } from '../entities/Folder';

export interface IFolderRepository {
  getAllFolders(): Promise<Folder[]>;
  getFolderById(id: string): Promise<Folder | null>;
  createFolder(folder: Omit<Folder, 'id' | 'createdAt' | 'updatedAt'>): Promise<Folder>;
  updateFolder(folder: Folder): Promise<Folder>;
  deleteFolder(id: string): Promise<boolean>;
  getFoldersByParent(parentId?: string): Promise<Folder[]>;
}
