import { Tag } from '../entities/Tag';

export interface ITagRepository {
  getAllTags(): Promise<Tag[]>;
  getTagByName(name: string): Promise<Tag | null>;
  createTag(name: string, color?: string): Promise<Tag>;
  incrementTagCount(name: string): Promise<void>;
  decrementTagCount(name: string): Promise<void>;
  deleteTag(id: string): Promise<boolean>;
}
