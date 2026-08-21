import React, { useState, useEffect } from 'react';
import { useDevice } from '../../../core/responsive/DeviceContext';
import { useDeckViewModel } from '../../viewmodels/useDeckViewModel';
import { M3Card } from '../../components/Material3/M3Card';
import { M3Button } from '../../components/Material3/M3Button';
import { QuestionSet, Question } from '../../../domain/entities/Question';
import { FlashCard } from '../../../domain/entities/Card';
import { FlashcardGenerationService } from '../../../data/services/FlashcardGenerationService';
import {
  X,
  CheckCircle2,
  XCircle,
  Sparkles,
  Plus,
  BookOpen,
  Check,
  CheckSquare,
  Square,
  Loader2,
  HelpCircle,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

export interface QuestionReviewToFlashcardsViewProps {
  questionSet: QuestionSet;
  onClose: () => void;
  onSuccess?: (deckId: string, cardCount: number) => void;
}

export const QuestionReviewToFlashcardsView: React.FC<QuestionReviewToFlashcardsViewProps> = ({
  questionSet,
  onClose,
  onSuccess,
}) => {
  const { colors } = useDevice();
  const { decks, createDeck } = useDeckViewModel();

  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(() => {
    // Pré-seleção inteligente: questões erradas vêm marcadas por padrão; certas desmarcadas
    const initial = new Set<string>();
    questionSet.questions.forEach((q) => {
      if (q.isAnswered && q.isCorrect === false) {
        initial.add(q.id);
      }
    });
    return initial;
  });

  const [targetDeckId, setTargetDeckId] = useState<string>('');
  const [isCreatingNewDeck, setIsCreatingNewDeck] = useState<boolean>(false);
  const [newDeckTitle, setNewDeckTitle] = useState<string>('');
  const [isCreatingDeckLoading, setIsCreatingDeckLoading] = useState<boolean>(false);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationProgress, setGenerationProgress] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Define default target deck on load if available
  useEffect(() => {
    if (!targetDeckId && decks.length > 0) {
      setTargetDeckId(decks[0].id);
    }
  }, [decks, targetDeckId]);

  const totalQuestions = questionSet.questions.length;
  const answeredCount = questionSet.answeredCount || questionSet.questions.filter((q) => q.isAnswered).length;
  const correctCount = questionSet.correctCount || questionSet.questions.filter((q) => q.isCorrect).length;
  const wrongCount = answeredCount - correctCount;
  const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

  const toggleQuestionSelection = (id: string) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllWrong = () => {
    const wrongIds = questionSet.questions
      .filter((q) => q.isAnswered && q.isCorrect === false)
      .map((q) => q.id);
    setSelectedQuestionIds(new Set(wrongIds));
  };

  const selectAll = () => {
    const allIds = questionSet.questions.map((q) => q.id);
    setSelectedQuestionIds(new Set(allIds));
  };

  const clearSelection = () => {
    setSelectedQuestionIds(new Set());
  };

  const handleCreateNewDeckInline = async () => {
    if (!newDeckTitle.trim()) return;
    setIsCreatingDeckLoading(true);
    try {
      const created = await createDeck({
        title: newDeckTitle.trim(),
        category: questionSet.request.configuration.specialty || 'Simulados',
        description: `Baralho criado a partir de questões do simulado: ${questionSet.title}`,
        icon: 'Brain',
        color: '#8B5CF6',
      });
      setTargetDeckId(created.id);
      setNewDeckTitle('');
      setIsCreatingNewDeck(false);
    } catch (err: any) {
      alert(err.message || 'Erro ao criar baralho.');
    } finally {
      setIsCreatingDeckLoading(false);
    }
  };

  const handleConvert = async () => {
    if (selectedQuestionIds.size === 0 || !targetDeckId) return;

    setIsGenerating(true);
    setErrorMsg(null);

    const selectedQuestions = questionSet.questions.filter((q) => selectedQuestionIds.has(q.id));
    setGenerationProgress(`Reformulando ${selectedQuestions.length} questão(ões) em flashcards atômicos via Gemini...`);

    try {
      const service = new FlashcardGenerationService();
      const generatedCards = await service.generateFlashcardsFromQuestions(
        selectedQuestions,
        targetDeckId
      );

      if (onSuccess) {
        onSuccess(targetDeckId, generatedCards.length);
      } else {
        alert(`${generatedCards.length} flashcard(s) gerado(s) e salvo(s) com sucesso no baralho!`);
        onClose();
      }
    } catch (err: any) {
      console.error('[QuestionReviewToFlashcardsView] Erro ao gerar flashcards:', err);
      setErrorMsg(err.message || 'Falha ao reformular questões em flashcards.');
    } finally {
      setIsGenerating(false);
      setGenerationProgress('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div
        className="w-full max-w-3xl rounded-3xl p-5 sm:p-7 space-y-6 shadow-2xl border my-auto max-h-[92vh] flex flex-col"
        style={{ backgroundColor: colors.surface, borderColor: colors.outline }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b pb-4 shrink-0" style={{ borderColor: colors.outlineVariant }}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-purple-500/15 text-purple-400 border border-purple-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>Revisar e Criar Flashcards</span>
              </h3>
              <p className="text-xs text-slate-400">
                Selecione as questões para reformulação em flashcards de recordação ativa por IA
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto space-y-5 pr-1 flex-1">
          {/* Desempenho Summary Card */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-0.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                Simulado: {questionSet.title}
              </span>
              <div className="text-sm font-semibold text-slate-200">
                Respostas: <span className="font-bold">{answeredCount}</span> de {totalQuestions}
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-semibold">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Acertos: {correctCount}</span>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300">
                <XCircle className="w-4 h-4 text-rose-400" />
                <span>Erros: {wrongCount}</span>
              </div>

              <div className="px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 font-bold">
                Aproveitamento: {accuracy}%
              </div>
            </div>
          </div>

          {/* Quick Selection Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllWrong}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 transition-colors flex items-center gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
                <span>Selecionar todas as erradas ({wrongCount})</span>
              </button>

              <button
                type="button"
                onClick={selectAll}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white/10 hover:bg-white/20 text-slate-200 border border-white/10 transition-colors"
              >
                Selecionar todas ({totalQuestions})
              </button>

              <button
                type="button"
                onClick={clearSelection}
                className="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
              >
                Limpar seleção
              </button>
            </div>

            <span className="text-xs font-bold text-purple-400">
              {selectedQuestionIds.size} de {totalQuestions} selecionada(s)
            </span>
          </div>

          {/* Deck Selector Section */}
          <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                <span>Baralho de Destino</span>
              </label>

              {!isCreatingNewDeck && (
                <button
                  type="button"
                  onClick={() => setIsCreatingNewDeck(true)}
                  className="text-xs text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Criar Novo Baralho</span>
                </button>
              )}
            </div>

            {isCreatingNewDeck ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Nome do novo baralho..."
                  value={newDeckTitle}
                  onChange={(e) => setNewDeckTitle(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs rounded-xl border outline-none font-medium"
                  style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                />
                <M3Button
                  variant="filled"
                  size="sm"
                  disabled={!newDeckTitle.trim() || isCreatingDeckLoading}
                  onClick={handleCreateNewDeckInline}
                >
                  {isCreatingDeckLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Salvar Baralho'}
                </M3Button>
                <button
                  type="button"
                  onClick={() => setIsCreatingNewDeck(false)}
                  className="p-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <select
                value={targetDeckId}
                onChange={(e) => setTargetDeckId(e.target.value)}
                className="w-full px-3 py-2.5 text-xs font-medium rounded-xl border outline-none cursor-pointer"
                style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
              >
                <option value="">-- Selecione o Baralho de Destino --</option>
                {decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d.category})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* List of Questions */}
          <div className="space-y-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Questões do Simulado
            </span>

            {questionSet.questions.map((question, index) => {
              const isSelected = selectedQuestionIds.has(question.id);
              const isAnswered = question.isAnswered;
              const isCorrect = question.isCorrect;

              const statementSnippet =
                question.statement.length > 150
                  ? question.statement.slice(0, 150) + '...'
                  : question.statement;

              return (
                <div
                  key={question.id}
                  onClick={() => toggleQuestionSelection(question.id)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                    isSelected
                      ? 'bg-purple-500/10 border-purple-500/50 shadow-sm'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    type="button"
                    className="mt-0.5 text-purple-400 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleQuestionSelection(question.id);
                    }}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-purple-400 fill-purple-500/20" />
                    ) : (
                      <Square className="w-5 h-5 opacity-40 hover:opacity-80" />
                    )}
                  </button>

                  <div className="flex-1 space-y-1.5 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-300">
                        Questão {index + 1}
                      </span>

                      {/* Badge Acerto / Erro e NeedsReview */}
                      <div className="flex items-center gap-1.5">
                        {question.needsReview && (
                          <span
                            className="badge-review text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1"
                            title="O dicionário médico local não reconheceu termos suficientes nesta questão — vale conferir a precisão antes de estudar por ela."
                          >
                            ⚠️ Conferir
                          </span>
                        )}
                        {question.flaggedSimilar && (
                          <span
                            className="badge-similar text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1"
                            title={question.similarityWarning || "Esta questão pode ter semelhança com outra deste simulado devido ao limite de diversidade do conteúdo-fonte."}
                          >
                            ⚠️ Similaridade Possível
                          </span>
                        )}

                        {isAnswered ? (
                          isCorrect ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>Acertou</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold flex items-center gap-1">
                              <XCircle className="w-3 h-3 text-rose-400" />
                              <span>Errou</span>
                            </span>
                          )
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-gray-500/20 text-gray-400 text-[10px] font-medium">
                            Não respondida
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-slate-200 leading-relaxed opacity-90 line-clamp-2">
                      {statementSnippet}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Error Feedback */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Modal Footer / Action Button */}
        <div className="pt-3 border-t flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0" style={{ borderColor: colors.outlineVariant }}>
          <span className="text-xs text-slate-400">
            {selectedQuestionIds.size === 0
              ? 'Selecione ao menos 1 questão para converter'
              : !targetDeckId
              ? 'Escolha um baralho de destino'
              : `${selectedQuestionIds.size} questão(ões) será(ão) reformulada(s) por IA em flashcards atômicos`}
          </span>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              disabled={isGenerating}
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold rounded-xl text-slate-300 hover:bg-white/10 transition-colors"
            >
              Cancelar
            </button>

            <M3Button
              variant="filled"
              size="md"
              disabled={selectedQuestionIds.size === 0 || !targetDeckId || isGenerating}
              onClick={handleConvert}
              className="w-full sm:w-auto bg-purple-600 hover:bg-purple-500 text-white font-bold"
              icon={
                isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 text-amber-300" />
                )
              }
            >
              {isGenerating
                ? generationProgress || 'Reformulando...'
                : `Transformar ${selectedQuestionIds.size} Questõ${selectedQuestionIds.size === 1 ? 'es' : 'es'} em Flashcards`}
            </M3Button>
          </div>
        </div>
      </div>
    </div>
  );
};
