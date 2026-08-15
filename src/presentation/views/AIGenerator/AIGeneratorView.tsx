import React, { useState } from 'react';
import { useAIGeneratorViewModel } from '../../viewmodels/useAIGeneratorViewModel';
import { useDeckViewModel } from '../../viewmodels/useDeckViewModel';
import { useDevice } from '../../../core/responsive/DeviceContext';
import { M3Card } from '../../components/Material3/M3Card';
import { M3Button } from '../../components/Material3/M3Button';
import { FlashCard, CardDifficulty, CardType } from '../../../domain/entities/Card';
import { EXAM_BOARD_OPTIONS } from '../../../data/services/ExamProfileService';
import {
  Sparkles,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  BookOpen,
  ArrowRight,
  UploadCloud,
  FileUp,
  FileSpreadsheet,
  FileImage,
  FileType,
  X,
  Search,
  Filter,
  RefreshCw,
  Edit3,
  Flame,
  Zap,
  Building2,
  UserCheck,
  ShieldCheck,
} from 'lucide-react';
import { ManualCardEditor } from './ManualCardEditor';
import { ReindexBanner } from '../../components/DesignSystem/ReindexBanner';

interface AIGeneratorViewProps {
  onSuccessNavigateToDeck?: (deckId: string) => void;
}

export const AIGeneratorView: React.FC<AIGeneratorViewProps> = ({ onSuccessNavigateToDeck }) => {
  const { colors } = useDevice();
  const { decks } = useDeckViewModel();
  const [creationMode, setCreationMode] = useState<'ai' | 'manual'>('ai');
  const {
    medicalText,
    setMedicalText,
    userInstructions,
    setUserInstructions,
    importedFiles,
    removeFile,
    clearFiles,
    subject,
    setSubject,
    examBoard,
    setExamBoard,
    professor,
    setProfessor,
    cardCount,
    setCardCount,
    cardType,
    setCardType,
    level,
    setLevel,
    targetDeckId,
    setTargetDeckId,
    generatedCards,
    filteredPreviewCards,
    isReadingFiles,
    isGenerating,
    error,
    successMsg,
    previewSearchQuery,
    setPreviewSearchQuery,
    previewDifficultyFilter,
    setPreviewDifficultyFilter,
    previewTypeFilter,
    setPreviewTypeFilter,
    editingCard,
    setEditingCard,
    updatePreviewCard,
    regeneratingCardId,
    regenerateSingleCard,
    handleSelectFilesFromDevice,
    handleGenerate,
    handleSaveGeneratedCards,
    removeCardFromPreview,
  } = useAIGeneratorViewModel();

  // Local state for edit modal
  const [editFront, setEditFront] = useState('');
  const [editBack, setEditBack] = useState('');
  const [editHint, setEditHint] = useState('');
  const [editMnemonic, setEditMnemonic] = useState('');
  const [editDifficulty, setEditDifficulty] = useState<CardDifficulty>('Médio');

  const openEditModal = (card: FlashCard) => {
    setEditingCard(card);
    setEditFront(card.front);
    setEditBack(card.back);
    setEditHint(card.hint || '');
    setEditMnemonic(card.mnemonic || '');
    setEditDifficulty(card.difficulty || 'Médio');
  };

  const saveEditedCard = () => {
    if (!editingCard) return;
    const updated: FlashCard = {
      ...editingCard,
      front: editFront,
      back: editBack,
      hint: editHint || undefined,
      mnemonic: editMnemonic || undefined,
      difficulty: editDifficulty,
      updatedAt: new Date().toISOString(),
    };
    updatePreviewCard(updated);
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'pdf':
        return <FileUp className="w-5 h-5 text-red-500 shrink-0" />;
      case 'docx':
      case 'pptx':
        return <FileSpreadsheet className="w-5 h-5 text-blue-500 shrink-0" />;
      case 'image':
        return <FileImage className="w-5 h-5 text-emerald-500 shrink-0" />;
      default:
        return <FileType className="w-5 h-5 text-amber-500 shrink-0" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-6">
      {/* Title Header */}
      <div className="space-y-1">
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
          style={{ backgroundColor: colors.tertiaryContainer, color: colors.onTertiaryContainer }}
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-500" />
          <span>Hub de Criação de Conteúdo & Inteligência Artificial Gemini 3.6 Flash</span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">Criar Flashcards Médicos</h2>
        <p className="text-sm text-slate-300 opacity-90">
          Gere flashcards automaticamente com IA ou crie manualmente no padrão do Anki Desktop.
        </p>
      </div>

      {/* Mode Selector (Segmented Button M3 Style) */}
      <div className="flex items-center p-1 rounded-2xl border w-fit" style={{ backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant }}>
        <button
          type="button"
          onClick={() => setCreationMode('ai')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            creationMode === 'ai'
              ? 'bg-cyan-600 text-white shadow-sm'
              : 'opacity-70 hover:opacity-100'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>✨ Gerar com IA</span>
        </button>

        <button
          type="button"
          onClick={() => setCreationMode('manual')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            creationMode === 'manual'
              ? 'bg-cyan-600 text-white shadow-sm'
              : 'opacity-70 hover:opacity-100'
          }`}
        >
          <Edit3 className="w-4 h-4" />
          <span>✍️ Criar Manualmente</span>
        </button>
      </div>

      {creationMode === 'manual' ? (
        <ManualCardEditor
          onCardSaved={(card) => {
            if (onSuccessNavigateToDeck && card.deckId) {
              // Option to notify or navigate
            }
          }}
        />
      ) : (
        <>
          {/* Banner de aviso de motor de busca desatualizado */}
          <ReindexBanner />

      {/* Main Form */}
      <M3Card variant="outlined" className="p-6 space-y-6">
        {/* Instruções de Geração (Campo Opcional) */}
        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 opacity-90">
            <FileText className="w-4 h-4 text-cyan-600" />
            <span>Instruções de Geração (Opcional)</span>
          </label>
          <textarea
            rows={5}
            placeholder="Ex: 'Foque em diagnóstico diferencial de dor torácica, nível avançado, priorize critérios diagnósticos e valores de corte' ou 'Gere cards sobre os capítulos de nefrologia que importei essa semana'"
            value={userInstructions}
            onChange={(e) => setUserInstructions(e.target.value)}
            className="w-full px-4 py-3 text-sm rounded-2xl border outline-none font-sans transition-colors focus:ring-2 focus:ring-purple-500/30"
            style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
          />
          <p className="text-xs text-slate-500 mt-1">
            O conteúdo vem automaticamente da sua biblioteca de materiais importados relacionados ao Assunto selecionado. Use este campo para guiar o foco, nível de detalhe ou ângulo da geração — ou cole um texto específico se preferir basear os cards nele.
          </p>
        </div>

        {/* Aviso: Assunto + Biblioteca */}
        {!medicalText.trim() && importedFiles.length === 0 && (
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs text-blue-400">
            ℹ️ Preenchendo apenas o <strong>Assunto/Especialidade</strong>, o sistema vai gerar cards automaticamente da sua biblioteca de materiais importados — nenhuma necessidade de colar texto ou anexar arquivo.
          </div>
        )}

        {/* Material de Estudo (Importação de Arquivos) */}
        <div
          className="p-5 rounded-2xl border space-y-4"
          style={{ backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Material de Estudo & ProvasAnteriores</span>
              </h3>
              <p className="text-xs opacity-75 mt-0.5">
                Envie múltiplos arquivos para extrair texto, embeddings semânticos e conceitos via IA Gemini
              </p>
            </div>

            {importedFiles.length > 0 && (
              <button
                onClick={clearFiles}
                className="text-xs text-red-500 hover:underline font-semibold"
              >
                Remover Todos
              </button>
            )}
          </div>

          {/* Botão Selecionar Arquivos */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={handleSelectFilesFromDevice}
              type="button"
              className="w-full sm:w-auto px-6 py-3.5 rounded-2xl border-2 border-dashed font-bold text-sm flex items-center justify-center gap-2.5 transition-all hover:border-purple-500 hover:bg-purple-500/5 active:scale-98"
              style={{ borderColor: colors.outline, color: colors.onSurface }}
            >
              <UploadCloud className="w-5 h-5 text-purple-600" />
              <span>Selecionar Arquivos</span>
            </button>

            <div className="text-[11px] opacity-70 text-center sm:text-left leading-relaxed">
              <span className="font-semibold block">Formatos suportados:</span>
              <span>PDF, DOCX, PPTX, TXT, Markdown, JPEG, PNG, WEBP, HEIC</span>
            </div>
          </div>

          {/* Lista dos Arquivos Selecionados */}
          {importedFiles.length > 0 && (
            <div className="space-y-2 pt-2">
              <span className="text-xs font-bold opacity-80">
                Arquivos Selecionados ({importedFiles.length})
              </span>

              <div className="grid grid-cols-1 gap-2.5 max-h-60 overflow-y-auto pr-1">
                {importedFiles.map((fileItem) => (
                  <div
                    key={fileItem.id}
                    className="p-3 rounded-xl border flex items-center justify-between gap-3 text-xs"
                    style={{ backgroundColor: colors.surface, borderColor: colors.outlineVariant }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {getFileIcon(fileItem.type)}
                      <div className="min-w-0">
                        <div className="font-semibold truncate max-w-[220px] sm:max-w-xs">
                          {fileItem.name}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] opacity-70">
                          <span>{fileItem.formattedSize}</span>
                          {fileItem.pageCount && <span>• ~{fileItem.pageCount} págs</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          fileItem.status === 'completed'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : fileItem.status === 'reading'
                            ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300 animate-pulse'
                            : fileItem.status === 'error'
                            ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                            : 'bg-gray-500/15 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {fileItem.status === 'completed'
                          ? 'Processado (Embeddings RAG OK)'
                          : fileItem.status === 'reading'
                          ? 'Lendo & Calculando Vetores...'
                          : fileItem.status === 'error'
                          ? 'Erro'
                          : 'Pendente'}
                      </span>

                      <button
                        onClick={() => removeFile(fileItem.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors"
                        title="Remover arquivo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {fileItem.status === 'reading' && (
                      <div className="w-full bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden col-span-full mt-1">
                        <div
                          className="bg-purple-600 h-full transition-all duration-300"
                          style={{ width: `${fileItem.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Configurations grid */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider opacity-90">
            Configurações da Geração
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {/* Baralho de Destino */}
            <div>
              <label className="block text-xs font-bold mb-1 opacity-80">Baralho de Destino *</label>
              <select
                value={targetDeckId}
                onChange={(e) => setTargetDeckId(e.target.value)}
                className="w-full px-3 py-2.5 text-xs font-medium rounded-xl border outline-none"
                style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
              >
                <option value="">-- Selecione o Baralho --</option>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d.category})
                  </option>
                ))}
              </select>
            </div>

            {/* Assunto Médico / Tag */}
            <div>
              <label className="block text-xs font-bold mb-1 opacity-80">Assunto / Especialidade</label>
              <input
                type="text"
                placeholder="Ex: Cardiologia, Eletrocardiograma..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium rounded-xl border outline-none"
                style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
              />
            </div>

            {/* Banca / Origem da Prova (Opcional) */}
            <div>
              <label className="block text-xs font-bold mb-1 opacity-80 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                <span>Banca / Origem (Opcional)</span>
              </label>
              <input
                type="text"
                list="banca-suggestions"
                placeholder="Ex: ENARE, Revalida, USP-SP..."
                value={examBoard}
                onChange={(e) => setExamBoard(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium rounded-xl border outline-none"
                style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
              />
              <datalist id="banca-suggestions">
                {EXAM_BOARD_OPTIONS.map((opt) => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
            </div>

            {/* Professor / Preceptor (Opcional) */}
            <div>
              <label className="block text-xs font-bold mb-1 opacity-80 flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Professor / Preceptor (Opcional)</span>
              </label>
              <input
                type="text"
                placeholder="Ex: Dr. Santos, Prof. Silva..."
                value={professor}
                onChange={(e) => setProfessor(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium rounded-xl border outline-none"
                style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
              />
            </div>

            {/* Modo de geração (Básico, Cloze, Misto) */}
            <div>
              <label className="block text-xs font-bold mb-1 opacity-80">Modo de Geração</label>
              <select
                value={cardType}
                onChange={(e) => setCardType(e.target.value as any)}
                className="w-full px-3 py-2.5 text-xs font-medium rounded-xl border outline-none"
                style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
              >
                <option value="cloze">Cloze (Lacunas {"{{c1::...}}"})</option>
                <option value="basic">Básico (Pergunta e Resposta)</option>
                <option value="mixed">Misto (Básico + Cloze)</option>
              </select>
            </div>

            {/* Quantidade máxima de cards */}
            <div>
              <label className="block text-xs font-bold mb-1 opacity-80">Qtd. Máxima de Cards</label>
              <select
                value={cardCount}
                onChange={(e) => setCardCount(Number(e.target.value))}
                className="w-full px-3 py-2.5 text-xs font-medium rounded-xl border outline-none"
                style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
              >
                <option value={3}>3 Flashcards</option>
                <option value={5}>5 Flashcards (Recomendado)</option>
                <option value={8}>8 Flashcards</option>
                <option value={10}>10 Flashcards</option>
                <option value={15}>15 Flashcards</option>
                <option value={20}>20 Flashcards</option>
                <option value={30}>30 Flashcards</option>
              </select>
            </div>
          </div>

          {/* Nível (Resumido, Intermediário, Completo) */}
          <div>
            <label className="block text-xs font-bold mb-1 opacity-80">Nível de Detalhamento</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                { id: 'resumido', label: 'Resumido', desc: 'Conceitos chave e definições essenciais' },
                { id: 'intermediario', label: 'Intermediário', desc: 'Visão clínica equilibrada e condutas' },
                { id: 'completo', label: 'Completo', desc: 'Fisiopatologia detalhada e exames' },
              ].map((lvl) => (
                <button
                  key={lvl.id}
                  type="button"
                  onClick={() => setLevel(lvl.id as any)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    level === lvl.id
                      ? 'border-purple-600 bg-purple-500/10 font-bold'
                      : 'border-gray-200 dark:border-gray-700 opacity-80'
                  }`}
                >
                  <div className="text-xs font-bold text-purple-600 dark:text-purple-400">
                    {lvl.label}
                  </div>
                  <div className="text-[10px] opacity-70 mt-0.5 leading-tight">{lvl.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Aviso de Proteção de Direitos Autorais e Inspiração de Estilo */}
        <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs opacity-90 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
          <div className="leading-relaxed text-[11px]">
            <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-0.5">
              Proteção de Direitos Autorais & RAG de Provas Reais
            </span>
            <span>
              O conteúdo de provas e livros importados é utilizado estritamente como contexto de referência semântica para inspirar o formato e nível de cobrança do Gemini. Nenhuma questão de prova é reproduzida literalmente.
            </span>
          </div>
        </div>

        {/* Feedback messages */}
        {error && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>

            {targetDeckId && onSuccessNavigateToDeck && (
              <button
                onClick={() => onSuccessNavigateToDeck(targetDeckId)}
                className="font-bold underline flex items-center gap-1 hover:opacity-80 shrink-0"
              >
                <span>Ir para o Baralho</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Action Submit Button */}
        <div className="pt-2 flex justify-end">
          <M3Button
            variant="filled"
            size="lg"
            disabled={isGenerating || isReadingFiles}
            onClick={handleGenerate}
            className="w-full sm:w-auto"
            icon={
              isGenerating || isReadingFiles ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )
            }
          >
            {isReadingFiles
              ? 'Lendo e Extraindo Materiais...'
              : isGenerating
              ? 'Analisando Conteúdo com Gemini...'
              : 'Gerar Flashcards com Gemini'}
          </M3Button>
        </div>
      </M3Card>

      {/* SEÇÃO DE PRÉ-VISUALIZAÇÃO DOS FLASHCARDS GERADOS */}
      {generatedCards.length > 0 && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span>Pré-visualização dos Flashcards ({filteredPreviewCards.length} de {generatedCards.length})</span>
              </h3>
              <p className="text-xs opacity-75">
                Revise, edite ou regenerar qualquer card antes de salvar no baralho.
              </p>
            </div>

            <M3Button
              variant="filled"
              size="md"
              className="w-full sm:w-auto"
              icon={<BookOpen className="w-4 h-4" />}
              onClick={handleSaveGeneratedCards}
            >
              Salvar Todos no Baralho
            </M3Button>
          </div>

          {/* Controls Bar: Search & Filters */}
          <M3Card variant="outlined" className="p-4 flex flex-col sm:flex-row gap-3 items-center">
            <div className="relative w-full sm:flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 opacity-50" />
              <input
                type="text"
                placeholder="Pesquisar nos cards gerados..."
                value={previewSearchQuery}
                onChange={(e) => setPreviewSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border outline-none"
                style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
              />
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <Filter className="w-3.5 h-3.5 opacity-60" />
              <span className="text-xs opacity-80 whitespace-nowrap">Dificuldade:</span>
              <select
                value={previewDifficultyFilter}
                onChange={(e) => setPreviewDifficultyFilter(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs rounded-xl border outline-none"
                style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
              >
                <option value="Todas">Todas</option>
                <option value="Fácil">Fácil</option>
                <option value="Médio">Médio</option>
                <option value="Difícil">Difícil</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <span className="text-xs opacity-80 whitespace-nowrap">Tipo:</span>
              <select
                value={previewTypeFilter}
                onChange={(e) => setPreviewTypeFilter(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs rounded-xl border outline-none"
                style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
              >
                <option value="Todas">Todos</option>
                <option value="cloze">Cloze</option>
                <option value="basic">Básico</option>
              </select>
            </div>
          </M3Card>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPreviewCards.map((card) => (
              <M3Card
                key={card.id}
                variant="elevated"
                className="p-4 space-y-3 relative flex flex-col justify-between transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-purple-500/15 text-purple-600 dark:text-purple-300">
                        {card.type}
                      </span>

                      {card.highYield && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <Flame className="w-3 h-3 text-amber-500" />
                          <span>High-Yield</span>
                        </span>
                      )}

                      {card.needsReview && (
                        <span
                          className="badge-review text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1"
                          title="O dicionário médico local não reconheceu termos suficientes neste card — vale conferir a precisão antes de estudar por ele."
                        >
                          ⚠️ Conferir
                        </span>
                      )}

                      <span className="text-[10px] opacity-70 border px-1.5 py-0.5 rounded">
                        {card.difficulty}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => regenerateSingleCard(card.id)}
                        disabled={regeneratingCardId === card.id}
                        className="p-1.5 rounded-lg hover:bg-purple-500/10 text-purple-600 transition-colors"
                        title="Regenerar este card com IA"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${
                            regeneratingCardId === card.id ? 'animate-spin' : ''
                          }`}
                        />
                      </button>

                      <button
                        onClick={() => openEditModal(card)}
                        className="p-1.5 rounded-lg hover:bg-blue-500/10 text-blue-600 transition-colors"
                        title="Editar flashcard"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => removeCardFromPreview(card.id)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors"
                        title="Remover deste lote"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-sm font-semibold">{card.front}</div>

                  <div
                    className="text-xs opacity-80 border-t pt-2"
                    style={{ borderColor: colors.outlineVariant }}
                  >
                    {card.back}
                  </div>

                  {card.hint && (
                    <div className="text-[11px] opacity-75 italic">
                      💡 Dica: {card.hint}
                    </div>
                  )}

                  {card.mnemonic && (
                    <div className="p-2 rounded-lg bg-amber-500/10 text-[11px] text-amber-600 dark:text-amber-400 font-medium flex items-start gap-1.5">
                      <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                      <span>{card.mnemonic}</span>
                    </div>
                  )}
                </div>
              </M3Card>
            ))}
          </div>
        </div>
      )}

      {/* MODAL DE EDIÇÃO DE FLASHCARD NA PRÉ-VISUALIZAÇÃO */}
      {editingCard && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="w-full max-w-lg rounded-3xl p-6 space-y-4 shadow-xl border"
            style={{ backgroundColor: colors.surface, borderColor: colors.outline }}
          >
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-purple-600" />
                <span>Editar Flashcard Gerado</span>
              </h3>
              <button
                onClick={() => setEditingCard(null)}
                className="p-1 rounded-full hover:bg-gray-500/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold mb-1 opacity-80">
                  Frente (Pergunta ou Cloze)
                </label>
                <textarea
                  rows={3}
                  value={editFront}
                  onChange={(e) => setEditFront(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border outline-none font-sans"
                  style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 opacity-80">
                  Verso (Explicação / Resposta Concisa)
                </label>
                <textarea
                  rows={3}
                  value={editBack}
                  onChange={(e) => setEditBack(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border outline-none font-sans"
                  style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 opacity-80">Dica (Opcional)</label>
                <input
                  type="text"
                  value={editHint}
                  onChange={(e) => setEditHint(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border outline-none"
                  style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 opacity-80">
                  Mnemônico / Pulo do Gato (Opcional)
                </label>
                <input
                  type="text"
                  value={editMnemonic}
                  onChange={(e) => setEditMnemonic(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl border outline-none"
                  style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 opacity-80">Dificuldade</label>
                <select
                  value={editDifficulty}
                  onChange={(e) => setEditDifficulty(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs rounded-xl border outline-none"
                  style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                >
                  <option value="Fácil">Fácil</option>
                  <option value="Médio">Médio</option>
                  <option value="Difícil">Difícil</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setEditingCard(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl hover:bg-gray-500/10"
              >
                Cancelar
              </button>
              <M3Button variant="filled" size="sm" onClick={saveEditedCard}>
                Salvar Alterações
              </M3Button>
            </div>
          </div>
        </div>
      )}
    </>
  )}
</div>
  );
};
