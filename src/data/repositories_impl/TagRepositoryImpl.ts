import { ITagRepository } from '../../domain/repositories/ITagRepository';
import { Tag } from '../../domain/entities/Tag';
import { db, MedAnkiDexieDB } from '../db/database';

export class TagRepositoryImpl implements ITagRepository {
  constructor(private database: MedAnkiDexieDB = db) {}

  async getAllTags(): Promise<Tag[]> {
    return await this.database.tags.toArray();
  }

  async getTagByName(name: string): Promise<Tag | null> {
    const tag = await this.database.tags.where('name').equals(name).first();
    return tag || null;
  }

  async createTag(name: string, color?: string): Promise<Tag> {
    const existing = await this.getTagByName(name);
    if (existing) {
      return existing;
    }

    const newTag: Tag = {
      id: `tag_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name,
      color: color || '#818CF8',
      cardCount: 0,
      createdAt: new Date().toISOString(),
    };
    await this.database.tags.put(newTag);
    return newTag;
  }

  async incrementTagCount(name: string): Promise<void> {
    const tag = await this.getTagByName(name);
    if (tag) {
      await this.database.tags.update(tag.id, { cardCount: tag.cardCount + 1 });
    } else {
      await this.createTag(name);
      const created = await this.getTagByName(name);
      if (created) {
        await this.database.tags.update(created.id, { cardCount: 1 });
      }
    }
  }

  async decrementTagCount(name: string): Promise<void> {
    const tag = await this.getTagByName(name);
    if (tag && tag.cardCount > 0) {
      await this.database.tags.update(tag.id, { cardCount: tag.cardCount - 1 });
    }
  }

  async deleteTag(id: string): Promise<boolean> {
    await this.database.tags.delete(id);
    return true;
  }
}
