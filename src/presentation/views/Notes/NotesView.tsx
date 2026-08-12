import React from 'react';
import { useNoteViewModel } from '../../viewmodels/useNoteViewModel';
import { NotesListView } from './NotesListView';
import { NoteEditorView } from './NoteEditorView';
import { Note } from '../../../domain/entities/Note';

interface NotesViewProps {
  onGenerateFlashcardsFromNote?: (note: Note) => void;
  onGenerateQuestionsFromNote?: (note: Note) => void;
}

export const NotesView: React.FC<NotesViewProps> = ({
  onGenerateFlashcardsFromNote,
  onGenerateQuestionsFromNote,
}) => {
  const { activeNote, setActiveNote, createNote } = useNoteViewModel();

  const handleCreateNew = async () => {
    try {
      const newNote = await createNote(
        'Nova Anotação de Estudo',
        '',
        undefined,
        undefined
      );
      setActiveNote(newNote);
    } catch (err) {
      console.error('Erro ao criar nota:', err);
    }
  };

  if (activeNote) {
    return (
      <NoteEditorView
        note={activeNote}
        onBack={() => setActiveNote(null)}
        onGenerateFlashcards={onGenerateFlashcardsFromNote}
        onGenerateQuestions={onGenerateQuestionsFromNote}
      />
    );
  }

  return (
    <NotesListView
      onSelectNote={(note) => setActiveNote(note)}
      onCreateNewNote={handleCreateNew}
    />
  );
};
