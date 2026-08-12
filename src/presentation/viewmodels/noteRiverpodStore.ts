import { StateNotifier, stateNotifierProvider } from '../../core/riverpod';
import { Note, NoteChatMessage } from '../../domain/entities/Note';
import { NoteRepositoryImpl } from '../../data/repositories_impl/NoteRepositoryImpl';
import { medKnowledgeService } from '../../data/services/medKnowledgeService';

export interface NoteState {
  notes: Note[];
  activeNote: Note | null;
  loading: boolean;
  isSendingChat: boolean;
  searchQuery: string;
  selectedSpecialty?: string;
  error: string | null;
}

const initialNoteState: NoteState = {
  notes: [],
  activeNote: null,
  loading: false,
  isSendingChat: false,
  searchQuery: '',
  selectedSpecialty: undefined,
  error: null,
};

export class NoteNotifier extends StateNotifier<NoteState> {
  private repository: NoteRepositoryImpl;

  constructor(repository: NoteRepositoryImpl = new NoteRepositoryImpl()) {
    super(initialNoteState);
    this.repository = repository;
    this.loadAllNotes();
  }

  async loadAllNotes(): Promise<void> {
    this.updateState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const notes = await this.repository.getAllNotes();
      this.updateState((prev) => ({
        ...prev,
        notes,
        loading: false,
        activeNote: prev.activeNote ? notes.find((n) => n.id === prev.activeNote?.id) || prev.activeNote : null,
      }));
    } catch (err: any) {
      console.error('[NoteNotifier] Failed to load notes:', err);
      this.updateState((prev) => ({
        ...prev,
        loading: false,
        error: 'Erro ao carregar anotações de estudo.',
      }));
    }
  }

  setSearchQuery(query: string): void {
    this.updateState((prev) => ({ ...prev, searchQuery: query }));
  }

  setSelectedSpecialty(specialty?: string): void {
    this.updateState((prev) => ({ ...prev, selectedSpecialty: specialty }));
  }

  setActiveNote(note: Note | null): void {
    this.updateState((prev) => ({ ...prev, activeNote: note }));
  }

  async createNote(
    title: string,
    content: string,
    specialty?: string,
    topic?: string
  ): Promise<Note> {
    this.updateState((prev) => ({ ...prev, error: null }));
    try {
      const newNote = await this.repository.createNote({
        title: title.trim() || 'Sem título',
        content,
        specialty,
        topic,
      });

      await this.loadAllNotes();
      this.setActiveNote(newNote);
      return newNote;
    } catch (err: any) {
      console.error('[NoteNotifier] Error creating note:', err);
      this.updateState((prev) => ({
        ...prev,
        error: 'Falha ao criar anotação de estudo.',
      }));
      throw err;
    }
  }

  async updateNote(note: Note): Promise<Note> {
    this.updateState((prev) => ({ ...prev, error: null }));
    try {
      const updated = await this.repository.updateNote(note);
      await this.loadAllNotes();
      if (this.state.activeNote?.id === note.id) {
        this.setActiveNote(updated);
      }
      return updated;
    } catch (err: any) {
      console.error('[NoteNotifier] Error updating note:', err);
      this.updateState((prev) => ({
        ...prev,
        error: 'Falha ao salvar alterações da anotação.',
      }));
      throw err;
    }
  }

  async deleteNote(id: string): Promise<boolean> {
    this.updateState((prev) => ({ ...prev, error: null }));
    try {
      const success = await this.repository.deleteNote(id);
      if (success) {
        if (this.state.activeNote?.id === id) {
          this.setActiveNote(null);
        }
        await this.loadAllNotes();
      }
      return success;
    } catch (err: any) {
      console.error('[NoteNotifier] Error deleting note:', err);
      this.updateState((prev) => ({
        ...prev,
        error: 'Falha ao excluir anotação.',
      }));
      return false;
    }
  }

  async sendChatMessage(noteId: string, userMessage: string): Promise<string> {
    const trimmedMessage = userMessage.trim();
    if (!trimmedMessage) return '';

    const targetNote =
      (this.state.activeNote?.id === noteId ? this.state.activeNote : null) ||
      this.state.notes.find((n) => n.id === noteId) ||
      (await this.repository.getNoteById(noteId));

    if (!targetNote) {
      const err = new Error('Anotação de estudo não encontrada.');
      this.updateState((prev) => ({ ...prev, error: err.message }));
      throw err;
    }

    this.updateState((prev) => ({ ...prev, isSendingChat: true, error: null }));

    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const userMsgObj: NoteChatMessage = {
      id: `msg_user_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      sender: 'user',
      text: trimmedMessage,
      time: timeStr,
    };

    const updatedHistory = [...targetNote.chatHistory, userMsgObj];

    try {
      const reply = await medKnowledgeService.chatNote({
        noteTitle: targetNote.title,
        noteContent: targetNote.content,
        userMessage: trimmedMessage,
        chatHistory: updatedHistory,
      });

      const aiMsgObj: NoteChatMessage = {
        id: `msg_ai_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        sender: 'ai',
        text: reply,
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      };

      const finalNote: Note = {
        ...targetNote,
        chatHistory: [...updatedHistory, aiMsgObj],
        updatedAt: new Date().toISOString(),
      };

      const saved = await this.repository.updateNote(finalNote);
      await this.loadAllNotes();
      this.setActiveNote(saved);
      this.updateState((prev) => ({ ...prev, isSendingChat: false }));
      return reply;
    } catch (err: any) {
      console.error('[NoteNotifier] Error in chatNote:', err);
      const errMsg = err.message || 'Falha ao processar mensagem do chat com a IA.';
      this.updateState((prev) => ({
        ...prev,
        isSendingChat: false,
        error: errMsg,
      }));
      throw new Error(errMsg);
    }
  }
}

export const noteRiverpodProvider = stateNotifierProvider<NoteNotifier, NoteState>(
  () => new NoteNotifier()
);
