import { useRiverpodState, useRiverpodNotifier } from '../../core/riverpod';
import { noteRiverpodProvider } from './noteRiverpodStore';
import { Note } from '../../domain/entities/Note';

export function useNoteViewModel() {
  const state = useRiverpodState(noteRiverpodProvider);
  const notifier = useRiverpodNotifier(noteRiverpodProvider);

  const filteredNotes = state.notes.filter((note) => {
    const matchesSearch =
      !state.searchQuery ||
      note.title.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(state.searchQuery.toLowerCase());

    const matchesSpecialty =
      !state.selectedSpecialty || note.specialty === state.selectedSpecialty;

    return matchesSearch && matchesSpecialty;
  });

  return {
    // Reactive State
    notes: state.notes,
    filteredNotes,
    activeNote: state.activeNote,
    loading: state.loading,
    isSendingChat: state.isSendingChat,
    searchQuery: state.searchQuery,
    selectedSpecialty: state.selectedSpecialty,
    error: state.error,

    // Reactive Actions
    refresh: () => notifier.loadAllNotes(),
    setSearchQuery: (q: string) => notifier.setSearchQuery(q),
    setSelectedSpecialty: (specialty?: string) => notifier.setSelectedSpecialty(specialty),
    setActiveNote: (note: Note | null) => notifier.setActiveNote(note),

    // Note CRUD Actions
    createNote: (title: string, content: string, specialty?: string, topic?: string) =>
      notifier.createNote(title, content, specialty, topic),
    updateNote: (note: Note) => notifier.updateNote(note),
    deleteNote: (id: string) => notifier.deleteNote(id),
    sendChatMessage: (noteId: string, userMessage: string) =>
      notifier.sendChatMessage(noteId, userMessage),
  };
}
