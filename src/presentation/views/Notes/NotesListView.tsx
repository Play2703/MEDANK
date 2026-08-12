import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNoteViewModel } from '../../viewmodels/useNoteViewModel';
import { useDevice } from '../../../core/responsive/DeviceContext';
import { M3Card } from '../../components/Material3/M3Card';
import { M3Button } from '../../components/Material3/M3Button';
import { Note } from '../../../domain/entities/Note';
import {
  BookOpen,
  Plus,
  Search,
  Trash2,
  Edit3,
  MessageSquare,
  Clock,
  Sparkles,
  Tag,
} from 'lucide-react';

interface NotesListViewProps {
  onSelectNote: (note: Note) => void;
  onCreateNewNote: () => void;
}

export const NotesListView: React.FC<NotesListViewProps> = ({
  onSelectNote,
  onCreateNewNote,
}) => {
  const { colors } = useDevice();
  const {
    filteredNotes,
    searchQuery,
    setSearchQuery,
    deleteNote,
    loading,
  } = useNoteViewModel();

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Deseja realmente excluir esta anotação de estudo?')) {
      setDeletingId(id);
      await deleteNote(id);
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-50" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar anotações por título ou conteúdo..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl text-sm font-medium border outline-none transition-all focus:ring-2 focus:ring-indigo-500"
            style={{
              backgroundColor: colors.surfaceContainer,
              borderColor: colors.outlineVariant,
              color: colors.onSurface,
            }}
          />
        </div>

        <M3Button
          variant="filled"
          icon={<Plus className="w-4 h-4" />}
          onClick={onCreateNewNote}
          className="shrink-0 font-bold"
        >
          Nova Nota de Estudo
        </M3Button>
      </div>

      {/* Notes Grid */}
      {loading ? (
        <div className="p-12 text-center text-sm opacity-60 flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4 animate-spin text-indigo-500" />
          <span>Carregando anotações...</span>
        </div>
      ) : filteredNotes.length === 0 ? (
        <M3Card variant="outlined" className="p-12 text-center space-y-4">
          <div
            className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center"
            style={{ backgroundColor: colors.secondaryContainer }}
          >
            <BookOpen className="w-6 h-6 text-indigo-500" />
          </div>
          <div>
            <h3 className="font-bold text-base">Nenhuma anotação encontrada</h3>
            <p className="text-xs opacity-70 max-w-sm mx-auto mt-1">
              Escreva ou cole seu material de estudo para tirar dúvidas com a IA e gerar flashcards ou simulados automaticamente.
            </p>
          </div>
          <M3Button
            variant="tonal"
            icon={<Plus className="w-4 h-4" />}
            onClick={onCreateNewNote}
            className="mx-auto"
          >
            Criar Minha Primeira Nota
          </M3Button>
        </M3Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredNotes.map((note) => {
              const snippet =
                note.content.length > 150
                  ? note.content.slice(0, 150) + '...'
                  : note.content || 'Anotação sem conteúdo...';
              const messageCount = note.chatHistory?.length || 0;
              const formattedDate = new Date(note.updatedAt).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <motion.div
                  key={note.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <M3Card
                    variant="elevated"
                    onClick={() => onSelectNote(note)}
                    className="p-5 cursor-pointer hover:shadow-md transition-all space-y-3 relative group border"
                    style={{ borderColor: colors.outlineVariant }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0 flex-1">
                        <h4 className="font-bold text-base truncate" style={{ color: colors.onSurface }}>
                          {note.title || 'Sem título'}
                        </h4>
                        {(note.specialty || note.topic) && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {note.specialty && (
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                                style={{
                                  backgroundColor: colors.primaryContainer,
                                  color: colors.onPrimaryContainer,
                                }}
                              >
                                {note.specialty}
                              </span>
                            )}
                            {note.topic && (
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-semibold opacity-80"
                                style={{
                                  backgroundColor: colors.secondaryContainer,
                                  color: colors.onSecondaryContainer,
                                }}
                              >
                                {note.topic}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, note.id)}
                        disabled={deletingId === note.id}
                        className="p-1.5 rounded-xl hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 transition-colors"
                        title="Excluir anotação"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <p className="text-xs opacity-75 line-clamp-3 leading-relaxed">
                      {snippet}
                    </p>

                    <div className="pt-2 border-t flex items-center justify-between text-[11px] opacity-60" style={{ borderColor: colors.outlineVariant }}>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{formattedDate}</span>
                      </span>

                      {messageCount > 0 && (
                        <span className="flex items-center gap-1 font-semibold text-indigo-500">
                          <MessageSquare className="w-3 h-3" />
                          <span>{messageCount} mensagens</span>
                        </span>
                      )}
                    </div>
                  </M3Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
