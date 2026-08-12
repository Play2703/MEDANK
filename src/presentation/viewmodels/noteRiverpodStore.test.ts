import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../data/db/database';
import { NoteNotifier } from './noteRiverpodStore';
import { NoteRepositoryImpl } from '../../data/repositories_impl/NoteRepositoryImpl';
import { medKnowledgeService } from '../../data/services/medKnowledgeService';

describe('NoteNotifier & noteRiverpodStore Unit Tests', () => {
  let repository: NoteRepositoryImpl;
  let notifier: NoteNotifier;

  beforeEach(async () => {
    await db.notes.clear();
    repository = new NoteRepositoryImpl(db);
    notifier = new NoteNotifier(repository);
    // Aguarda carga inicial de notas do banco limpo
    await notifier.loadAllNotes();
  });

  it('deve criar uma nova nota de estudo com sucesso', async () => {
    const created = await notifier.createNote(
      'Cetoacidose Diabética',
      'Paciente com glicemia de 450 mg/dL e pH 7.15.',
      'Endocrinologia',
      'Diabetes Mellitus'
    );

    expect(created).toBeDefined();
    expect(created.id).toBeDefined();
    expect(created.title).toBe('Cetoacidose Diabética');
    expect(created.specialty).toBe('Endocrinologia');
    expect(created.chatHistory).toEqual([]);

    const state = notifier.state;
    expect(state.notes).toHaveLength(1);
    expect(state.activeNote?.id).toBe(created.id);
  });

  it('deve editar e atualizar uma nota existente', async () => {
    const created = await notifier.createNote('Nota Inicial', 'Conteúdo v1');
    const updatedNote = {
      ...created,
      title: 'Nota Editada',
      content: 'Conteúdo v2 atualizado',
    };

    const saved = await notifier.updateNote(updatedNote);
    expect(saved.title).toBe('Nota Editada');
    expect(saved.content).toBe('Conteúdo v2 atualizado');

    const inDb = await db.notes.get(created.id);
    expect(inDb?.title).toBe('Nota Editada');
  });

  it('deve excluir uma nota existente', async () => {
    const created = await notifier.createNote('Nota a Excluir', 'Conteúdo');
    expect(notifier.state.notes).toHaveLength(1);

    const deleted = await notifier.deleteNote(created.id);
    expect(deleted).toBe(true);
    expect(notifier.state.notes).toHaveLength(0);
    expect(notifier.state.activeNote).toBeNull();
  });

  it('deve enviar mensagem no chat da IA (mockando medKnowledgeService.chatNote) e persistir chatHistory', async () => {
    const created = await notifier.createNote('Insuficiência Cardíaca', 'Fração de ejeção reduzida');
    
    const mockReplyText = 'O tratamento de primeira linha inclui IECA/BRA + Beta-bloqueador + iSGLT2 + Espironolactona.';
    const spyChat = vi.spyOn(medKnowledgeService, 'chatNote').mockResolvedValue(mockReplyText);

    const reply = await notifier.sendChatMessage(
      created.id,
      'Qual o esquema quadruplo de primeira linha na ICFER?'
    );

    expect(reply).toBe(mockReplyText);
    expect(spyChat).toHaveBeenCalledWith(
      expect.objectContaining({
        noteTitle: 'Insuficiência Cardíaca',
        userMessage: 'Qual o esquema quadruplo de primeira linha na ICFER?',
      })
    );

    const state = notifier.state;
    const activeHistory = state.activeNote?.chatHistory || [];
    expect(activeHistory).toHaveLength(2);
    expect(activeHistory[0].sender).toBe('user');
    expect(activeHistory[0].text).toBe('Qual o esquema quadruplo de primeira linha na ICFER?');
    expect(activeHistory[1].sender).toBe('ai');
    expect(activeHistory[1].text).toBe(mockReplyText);

    // Confirmar persistência no IndexedDB (Dexie)
    const storedInDb = await db.notes.get(created.id);
    expect(storedInDb?.chatHistory).toHaveLength(2);
    expect(storedInDb?.chatHistory[1].text).toBe(mockReplyText);

    spyChat.mockRestore();
  });
});
