import { Note } from '../entities/Note';

export interface INoteRepository {
  getAllNotes(): Promise<Note[]>;
  getNoteById(id: string): Promise<Note | null>;
  createNote(
    noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'chatHistory'> & {
      chatHistory?: Note['chatHistory'];
    }
  ): Promise<Note>;
  updateNote(note: Note): Promise<Note>;
  deleteNote(id: string): Promise<boolean>;
}
