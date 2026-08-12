import { INoteRepository } from '../../domain/repositories/INoteRepository';
import { Note } from '../../domain/entities/Note';
import { db, MedAnkiDexieDB } from '../db/database';

export class NoteRepositoryImpl implements INoteRepository {
  constructor(private database: MedAnkiDexieDB = db) {}

  async getAllNotes(): Promise<Note[]> {
    try {
      const notes = await this.database.notes.toArray();
      return notes.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch (err) {
      console.warn('[NoteRepositoryImpl] Failed to load notes from Dexie:', err);
      return [];
    }
  }

  async getNoteById(id: string): Promise<Note | null> {
    try {
      const note = await this.database.notes.get(id);
      return note || null;
    } catch (err) {
      console.warn(`[NoteRepositoryImpl] Failed to get note by id ${id}:`, err);
      return null;
    }
  }

  async createNote(
    noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'chatHistory'> & {
      chatHistory?: Note['chatHistory'];
    }
  ): Promise<Note> {
    const now = new Date().toISOString();
    const newNote: Note = {
      ...noteData,
      id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      chatHistory: noteData.chatHistory || [],
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.database.notes.put(newNote);
    } catch (err) {
      console.warn('[NoteRepositoryImpl] Failed to save new note to Dexie:', err);
    }
    return newNote;
  }

  async updateNote(note: Note): Promise<Note> {
    const updatedNote: Note = {
      ...note,
      updatedAt: new Date().toISOString(),
    };
    try {
      await this.database.notes.put(updatedNote);
    } catch (err) {
      console.warn(`[NoteRepositoryImpl] Failed to update note ${note.id}:`, err);
    }
    return updatedNote;
  }

  async deleteNote(id: string): Promise<boolean> {
    try {
      await this.database.notes.delete(id);
      return true;
    } catch (err) {
      console.warn(`[NoteRepositoryImpl] Failed to delete note ${id}:`, err);
      return false;
    }
  }
}
