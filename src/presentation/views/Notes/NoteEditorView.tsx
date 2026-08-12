import React, { useState, useEffect, useRef } from 'react';
import { useNoteViewModel } from '../../viewmodels/useNoteViewModel';
import { useAIGeneratorViewModel } from '../../viewmodels/useAIGeneratorViewModel';
import { useQuestionViewModel } from '../../viewmodels/useQuestionViewModel';
import { useGoRouter } from '../../../core/router/GoRouter';
import { useDevice } from '../../../core/responsive/DeviceContext';
import { M3Card } from '../../components/Material3/M3Card';
import { M3Button } from '../../components/Material3/M3Button';
import { Note } from '../../../domain/entities/Note';
import {
  BASIC_CYCLE_SPECIALTIES,
  CLINICAL_CYCLE_SPECIALTIES,
  CURRICULUM_TOPICS_BY_SPECIALTY,
} from '../../../data/curriculumTopics';
import {
  ArrowLeft,
  Save,
  Sparkles,
  Send,
  Loader2,
  Bot,
  User,
  MessageSquare,
  Zap,
  HelpCircle,
  BookOpen,
  CheckCircle,
} from 'lucide-react';

interface NoteEditorViewProps {
  note: Note;
  onBack: () => void;
  onGenerateFlashcards?: (note: Note) => void;
  onGenerateQuestions?: (note: Note) => void;
}

export const NoteEditorView: React.FC<NoteEditorViewProps> = ({
  note,
  onBack,
  onGenerateFlashcards,
  onGenerateQuestions,
}) => {
  const { isMobileViewport, colors } = useDevice();
  const isDesktop = !isMobileViewport;
  const { go } = useGoRouter();
  const { updateNote, sendChatMessage, isSendingChat } = useNoteViewModel();
  const { setMedicalText, setSubject } = useAIGeneratorViewModel();
  const { setGenerationMode, setCurrentStep, setPrefilledConfiguration } = useQuestionViewModel();

  const [title, setTitle] = useState(note.title || '');
  const [content, setContent] = useState(note.content || '');
  const [specialty, setSpecialty] = useState<string>(note.specialty || '');
  const [topic, setTopic] = useState<string>(note.topic || '');
  const [userMsg, setUserMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTitle(note.title || '');
    setContent(note.content || '');
    setSpecialty(note.specialty || '');
    setTopic(note.topic || '');
  }, [note.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [note.chatHistory, isSendingChat]);

  const allSpecialties = [...BASIC_CYCLE_SPECIALTIES, ...CLINICAL_CYCLE_SPECIALTIES];
  const availableTopics = specialty ? CURRICULUM_TOPICS_BY_SPECIALTY[specialty] || [] : [];

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated: Note = {
        ...note,
        title: title.trim() || 'Sem título',
        content,
        specialty: specialty || undefined,
        topic: topic || undefined,
        updatedAt: new Date().toISOString(),
      };
      await updateNote(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error('Falha ao salvar nota:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userMsg.trim() || isSendingChat) return;

    const messageText = userMsg;
    setUserMsg('');

    try {
      // Autosave content before sending chat so AI sees latest text
      const updatedNote: Note = {
        ...note,
        title: title.trim() || 'Sem título',
        content,
        specialty: specialty || undefined,
        topic: topic || undefined,
        updatedAt: new Date().toISOString(),
      };
      await updateNote(updatedNote);
      await sendChatMessage(note.id, messageText);
    } catch (err) {
      console.error('Erro no envio de mensagem do chat:', err);
    }
  };

  const handleActionGenerateFlashcards = () => {
    handleSave();
    setMedicalText(content);
    if (specialty) setSubject(specialty);
    if (onGenerateFlashcards) {
      onGenerateFlashcards({ ...note, title, content, specialty, topic });
    }
    go('/ai-generator');
  };

  const handleActionGenerateQuestions = () => {
    handleSave();
    setPrefilledConfiguration({
      customContext: content,
      specialty: specialty || undefined,
      topics: topic ? [topic] : undefined,
    });
    setGenerationMode('geral');
    setCurrentStep('generate');
    if (onGenerateQuestions) {
      onGenerateQuestions({ ...note, title, content, specialty, topic });
    }
    go('/questions');
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b" style={{ borderColor: colors.outlineVariant }}>
        <div className="flex items-center gap-2">
          <M3Button variant="text" icon={<ArrowLeft className="w-4 h-4" />} onClick={onBack}>
            Voltar
          </M3Button>
          <div>
            <h2 className="text-xl font-bold tracking-tight" style={{ color: colors.onSurface }}>
              {title || 'Nova Anotação'}
            </h2>
            <p className="text-xs opacity-70">Caderno Inteligente de Estudos Médico com Tutor IA</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <M3Button
            variant={saveSuccess ? 'tonal' : 'outlined'}
            icon={saveSuccess ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Save className="w-4 h-4" />}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Salvando...' : saveSuccess ? 'Salvo!' : 'Salvar Alterações'}
          </M3Button>

          <button
            type="button"
            onClick={handleActionGenerateFlashcards}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border border-amber-500/30 transition-all"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Gerar Flashcards</span>
          </button>

          <button
            type="button"
            onClick={handleActionGenerateQuestions}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 border border-indigo-500/30 transition-all"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Gerar Questões</span>
          </button>
        </div>
      </div>

      {/* Main Split Layout: Editor (Left) + Chat Tutor (Right / Bottom) */}
      <div className={`grid ${isDesktop ? 'grid-cols-12 gap-6' : 'grid-cols-1 gap-6'}`}>
        {/* Left Column: Note Content Editor */}
        <div className={`${isDesktop ? 'col-span-7 space-y-4' : 'space-y-4'}`}>
          <M3Card variant="outlined" className="p-5 space-y-4">
            {/* Title & Specialty / Topic Selection */}
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider opacity-70 mb-1">
                  Título da Anotação
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Cetoacidose Diabética - Manejo e Protocolos"
                  className="w-full px-3.5 py-2 rounded-xl text-sm font-bold border outline-none transition-all focus:ring-2 focus:ring-indigo-500"
                  style={{
                    backgroundColor: colors.surfaceContainer,
                    borderColor: colors.outlineVariant,
                    color: colors.onSurface,
                  }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider opacity-70 mb-1">
                    Especialidade
                  </label>
                  <select
                    value={specialty}
                    onChange={(e) => {
                      setSpecialty(e.target.value);
                      setTopic('');
                    }}
                    className="w-full px-3 py-2 rounded-xl text-xs font-medium border outline-none"
                    style={{
                      backgroundColor: colors.surfaceContainer,
                      borderColor: colors.outlineVariant,
                      color: colors.onSurface,
                    }}
                  >
                    <option value="">Selecione uma especialidade...</option>
                    {allSpecialties.map((spec) => (
                      <option key={spec} value={spec}>
                        {spec}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider opacity-70 mb-1">
                    Tópico Específico
                  </label>
                  <select
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    disabled={!specialty || availableTopics.length === 0}
                    className="w-full px-3 py-2 rounded-xl text-xs font-medium border outline-none disabled:opacity-50"
                    style={{
                      backgroundColor: colors.surfaceContainer,
                      borderColor: colors.outlineVariant,
                      color: colors.onSurface,
                    }}
                  >
                    <option value="">
                      {!specialty ? 'Escolha a especialidade primeiro' : 'Selecione o tópico...'}
                    </option>
                    {availableTopics.map((top) => (
                      <option key={top} value={top}>
                        {top}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Note Content Textarea */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider opacity-70 mb-1">
                Conteúdo do Texto / Anotação Livre
              </label>
              <textarea
                rows={14}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Escreva ou cole aqui seus resumos médicos, trechos de aulas, diretrizes ou anotações clínicas..."
                className="w-full p-4 rounded-2xl text-xs font-mono leading-relaxed border outline-none resize-y transition-all focus:ring-2 focus:ring-indigo-500"
                style={{
                  backgroundColor: colors.surfaceContainer,
                  borderColor: colors.outlineVariant,
                  color: colors.onSurface,
                }}
              />
            </div>
          </M3Card>
        </div>

        {/* Right Column: AI Tutor Chat Panel */}
        <div className={`${isDesktop ? 'col-span-5' : 'col-span-1'}`}>
          <M3Card variant="outlined" className="p-4 flex flex-col h-[580px] space-y-3">
            {/* Chat Header */}
            <div className="pb-3 border-b flex items-center justify-between" style={{ borderColor: colors.outlineVariant }}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-500 flex items-center justify-center font-bold">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-xs">Tutor IA Contextual MedAnki</h3>
                  <p className="text-[10px] opacity-70">Tire dúvidas sobre o texto ao lado</p>
                </div>
              </div>
            </div>

            {/* Chat History List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {(!note.chatHistory || note.chatHistory.length === 0) ? (
                <div className="h-full flex flex-col items-center justify-center p-6 text-center text-xs opacity-60 space-y-2">
                  <Bot className="w-8 h-8 text-indigo-400 opacity-80" />
                  <p className="font-semibold">Nenhuma pergunta feita ainda</p>
                  <p className="text-[11px] max-w-xs">
                    Pergunte qualquer dúvida clínica, peça explicações sobre os conceitos desta nota ou peça exemplos de condutas.
                  </p>
                </div>
              ) : (
                note.chatHistory.map((msg) => {
                  const isUser = msg.sender === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${
                          isUser ? 'bg-indigo-600 text-white' : 'bg-purple-600 text-white'
                        }`}
                      >
                        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                      </div>

                      <div
                        className={`p-3 rounded-2xl max-w-[85%] text-xs space-y-1 ${
                          isUser
                            ? 'bg-indigo-600 text-white rounded-tr-none'
                            : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
                        }`}
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                        <span className="block text-[9px] opacity-60 text-right">{msg.time}</span>
                      </div>
                    </div>
                  );
                })
              )}

              {isSendingChat && (
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-800 text-slate-300 text-xs rounded-tl-none border border-slate-700">
                    Tutor IA digitando resposta...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input Form */}
            <form onSubmit={handleSendChat} className="pt-2 border-t flex items-center gap-2" style={{ borderColor: colors.outlineVariant }}>
              <input
                type="text"
                value={userMsg}
                onChange={(e) => setUserMsg(e.target.value)}
                placeholder="Pergunte algo sobre a anotação..."
                disabled={isSendingChat}
                className="flex-1 px-3.5 py-2 rounded-xl text-xs border outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
                style={{
                  backgroundColor: colors.surfaceContainer,
                  borderColor: colors.outlineVariant,
                  color: colors.onSurface,
                }}
              />
              <button
                type="submit"
                disabled={!userMsg.trim() || isSendingChat}
                className="p-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition-all disabled:opacity-40 shrink-0"
                title="Enviar mensagem"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </M3Card>
        </div>
      </div>
    </div>
  );
};
