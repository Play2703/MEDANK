import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useQuestionViewModel } from '../../viewmodels/useQuestionViewModel';
import { useDevice } from '../../../core/responsive/DeviceContext';
import { M3Card } from '../../components/Material3/M3Card';
import { M3Button } from '../../components/Material3/M3Button';
import { QuestionSet, Question, StructuredCommentary } from '../../../domain/entities/Question';
import { PDFExamExportService } from '../../../data/services/PDFExamExportService';
import { QuestionReviewToFlashcardsView } from './QuestionReviewToFlashcardsView';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Share2,
  BookOpen,
  Award,
  ChevronRight,
  ChevronLeft,
  Info,
  Sparkles,
  Check,
  RefreshCw,
  FileText,
  Stethoscope,
  AlertTriangle,
  X,
} from 'lucide-react';

interface QuestionPracticeViewProps {
  onBack: () => void;
}

export const QuestionPracticeView: React.FC<QuestionPracticeViewProps> = ({ onBack }) => {
  const { colors, isMobileViewport } = useDevice();
  const {
    activeQuestionSet,
    answerQuestion,
    generationShortfall,
    clearGenerationShortfall,
    similarityRegenStats,
    clearSimilarityRegenStats,
  } = useQuestionViewModel();

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [showCommentary, setShowCommentary] = useState<boolean>(true);
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);

  if (!activeQuestionSet || activeQuestionSet.questions.length === 0) {
    return (
      <div className="text-center py-12 space-y-4">
        <HelpCircle className="w-12 h-12 mx-auto text-indigo-400 opacity-50" />
        <h3 className="text-lg font-bold">Nenhum simulado selecionado</h3>
        <M3Button onClick={onBack}>Voltar para o Módulo de Questões</M3Button>
      </div>
    );
  }

  const currentQuestion = activeQuestionSet.questions[currentIndex];
  const total = activeQuestionSet.questions.length;
  const answeredCount = activeQuestionSet.answeredCount;
  const correctCount = activeQuestionSet.correctCount;
  const accuracy = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

  const handleSelectOption = async (optionId: string) => {
    if (currentQuestion.isAnswered) return;
    await answerQuestion(activeQuestionSet.id, currentQuestion.id, optionId);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-6">
      {/* Top Header */}
      <div className={`flex ${isMobileViewport ? 'flex-col gap-3' : 'items-center justify-between gap-4'}`}>
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors shrink-0"
            title="Voltar para a lista de simulados"
            aria-label="Voltar para a lista de simulados"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-lg font-bold line-clamp-1">{activeQuestionSet.title}</h2>
            <p className="text-xs opacity-75">
              {activeQuestionSet.request.configuration.specialty} • {activeQuestionSet.request.mode === 'banca' ? activeQuestionSet.request.bancaName || 'Banca' : activeQuestionSet.request.professorName || 'Professor'}
            </p>
          </div>
        </div>

        <div className={`flex items-center gap-2 ${isMobileViewport ? 'w-full justify-end flex-wrap' : 'shrink-0'}`}>
          <M3Button
            variant="filled"
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-md font-semibold shrink-0"
            icon={<FileText className="w-4 h-4 text-white" />}
            title="Exportar Simulado em PDF (Padrão Oficial)"
            aria-label="Exportar Simulado em PDF (Padrão Oficial)"
            onClick={async () => {
              try {
                await PDFExamExportService.exportToPDF(activeQuestionSet);
              } catch (err: any) {
                alert(err.message || 'Erro ao gerar PDF do simulado.');
              }
            }}
          >
            PDF
          </M3Button>
          <M3Button
            variant="outlined"
            size="sm"
            className="bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 border-purple-500/40 font-bold shrink-0"
            icon={<Sparkles className="w-4 h-4 text-purple-400" />}
            title="Revisar questões erradas e converter em Flashcards"
            aria-label="Revisar e Criar Flashcards"
            onClick={() => setShowReviewModal(true)}
          >
            Revisar e Criar Flashcards
          </M3Button>
        </div>
      </div>

      {/* Shortfall Warning Banner */}
      {generationShortfall && activeQuestionSet && generationShortfall.setId === activeQuestionSet.id && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Simulado gerado com {generationShortfall.actual} de {generationShortfall.requested} questões solicitadas — algumas questões não passaram no controle de qualidade e não puderam ser substituídas.
            </span>
          </div>
          <button
            onClick={clearGenerationShortfall}
            className="p-1 rounded-lg hover:bg-amber-500/20 text-amber-300 transition-colors shrink-0"
            title="Fechar aviso"
            aria-label="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Similarity Regeneration Banner */}
      {similarityRegenStats && activeQuestionSet && similarityRegenStats.setId === activeQuestionSet.id && similarityRegenStats.count > 0 && (
        <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-200 text-xs flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>
              ⚠️ {similarityRegenStats.count} regeneração{similarityRegenStats.count > 1 ? 'ões' : ''} por similaridade (modelo leve) consumiu ~{similarityRegenStats.estimatedTokens} tokens extras.
            </span>
          </div>
          <button
            onClick={clearSimilarityRegenStats}
            className="p-1 rounded-lg hover:bg-indigo-500/20 text-indigo-300 transition-colors shrink-0"
            title="Fechar aviso"
            aria-label="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Progress & Score Bar */}
      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-indigo-400">
            Questão {currentIndex + 1} de {total}
          </span>
          <span className="text-xs opacity-50">•</span>
          <span className="text-xs font-semibold opacity-80">
            Respondidas: {answeredCount}/{total}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs font-bold">
            Acertos: <span className="text-emerald-400">{correctCount}</span> ({accuracy}%)
          </div>
        </div>
      </div>

      {/* Main Question Card */}
      <M3Card variant="outlined" className="p-6 space-y-6 border-indigo-500/20">
        {/* Question Origin Tag */}
        <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {currentQuestion.originSource}
            </span>
            {currentQuestion.needsReview && (
              <span
                className="badge-review text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1"
                title="O dicionário médico local não reconheceu termos suficientes nesta questão — vale conferir a precisão antes de estudar por ela."
              >
                ⚠️ Conferir
              </span>
            )}
          </div>
          <span className="text-xs font-medium opacity-60">
            Nível: {currentQuestion.difficulty.toUpperCase()}
          </span>
        </div>

        {/* Statement */}
        <div className="space-y-3">
          <p className="text-sm md:text-base leading-relaxed font-medium">
            {currentQuestion.statement}
          </p>
        </div>

        {/* Options List */}
        <div className="space-y-3 pt-2">
          {currentQuestion.options.map((option) => {
            const isSelected = currentQuestion.userAnswerId === option.id;
            const isAnswered = currentQuestion.isAnswered;
            const isCorrectOption = option.id === currentQuestion.correctOptionId;

            let optionStyle = 'bg-white/5 border-white/10 hover:border-white/20';

            if (isAnswered) {
              if (isCorrectOption) {
                optionStyle = 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200';
              } else if (isSelected && !isCorrectOption) {
                optionStyle = 'bg-rose-500/15 border-rose-500/50 text-rose-200';
              }
            }

            return (
              <button
                key={option.id}
                disabled={isAnswered}
                onClick={() => handleSelectOption(option.id)}
                className={`w-full p-4 rounded-2xl border text-left text-sm transition-all flex items-start gap-3 ${optionStyle} ${
                  !isAnswered ? 'hover:scale-[1.005] cursor-pointer' : 'cursor-default'
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                    isAnswered && isCorrectOption
                      ? 'bg-emerald-500 text-white'
                      : isAnswered && isSelected && !isCorrectOption
                      ? 'bg-rose-500 text-white'
                      : 'bg-white/10 text-white'
                  }`}
                >
                  {option.letter}
                </span>

                <span className="flex-1 leading-relaxed pt-0.5">{option.text}</span>

                {isAnswered && isCorrectOption && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                )}
                {isAnswered && isSelected && !isCorrectOption && (
                  <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                )}
              </button>
            );
          })}
        </div>

        {/* Commentary & References Section (shows when answered) */}
        {currentQuestion.isAnswered && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 space-y-3 pt-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span>Gabarito Comentado e Justificativa</span>
              </h4>
            </div>

            {typeof currentQuestion.commentary === 'object' && currentQuestion.commentary !== null ? (
              (() => {
                const comm = currentQuestion.commentary as StructuredCommentary;
                const incorrectOptions = currentQuestion.options.filter(
                  (o) => !o.isCorrect && o.id !== currentQuestion.correctOptionId
                );

                return (
                  <div className="space-y-3.5 text-xs md:text-sm leading-relaxed">
                    {/* 1. Explicação da Correta */}
                    {comm.correta && (
                      <div className="space-y-1">
                        <span className="font-bold text-emerald-400 block text-xs uppercase tracking-wider">
                          Justificativa da Alternativa Correta:
                        </span>
                        <p className="opacity-90">{comm.correta}</p>
                      </div>
                    )}

                    {/* 2. Lista de alternativas incorretas */}
                    {incorrectOptions.length > 0 && (
                      <div className="space-y-2 pt-1 border-t border-white/10">
                        <span className="font-bold text-rose-300 block text-xs uppercase tracking-wider">
                          Análise dos Distratores:
                        </span>
                        <ul className="space-y-2 pl-0.5">
                          {incorrectOptions.map((opt) => {
                            const exp = (comm.porOpcao && comm.porOpcao[opt.letter]) || opt.explanation;
                            if (!exp) return null;
                            return (
                              <li key={opt.id} className="flex items-start gap-2.5">
                                <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-bold text-xs shrink-0 mt-0.5">
                                  {opt.letter}
                                </span>
                                <span className="opacity-90">{exp}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {/* 3. Correlação Clínica */}
                    {comm.correlacaoClinica && (
                      <div className="p-3 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-start gap-2.5">
                        <Stethoscope className="w-4 h-4 text-indigo-300 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <span className="font-bold text-indigo-300 text-xs block uppercase tracking-wider">
                            Correlação Clínica & Diretriz:
                          </span>
                          <p className="opacity-95 text-xs md:text-sm">{comm.correlacaoClinica}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <p className="text-xs md:text-sm leading-relaxed opacity-90 whitespace-pre-line">
                {typeof currentQuestion.commentary === 'string'
                  ? currentQuestion.commentary
                  : JSON.stringify(currentQuestion.commentary)}
              </p>
            )}

            {currentQuestion.sourceContextExcerpt && (
              <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-indigo-300">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>
                    Trecho de Origem no Material de Estudo
                    {currentQuestion.coverageUnitLabel ? ` (${currentQuestion.coverageUnitLabel})` : ''}:
                  </span>
                </div>
                <p className="italic text-slate-300 leading-relaxed">
                  "{currentQuestion.sourceContextExcerpt}"
                </p>
              </div>
            )}

            {currentQuestion.references && currentQuestion.references.length > 0 && (
              <div className="pt-2 border-t border-white/10 text-xs opacity-75 space-y-1">
                <span className="font-bold text-indigo-300">Referências Bibliográficas:</span>
                <ul className="list-disc list-inside space-y-0.5 pl-1">
                  {currentQuestion.references.map((ref, i) => (
                    <li key={i}>{ref}</li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </M3Card>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <M3Button
          variant="outlined"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
          icon={<ChevronLeft className="w-4 h-4" />}
        >
          Anterior
        </M3Button>

        <span className="text-xs font-bold opacity-75">
          {currentIndex + 1} / {total}
        </span>

        <M3Button
          variant="filled"
          disabled={currentIndex === total - 1}
          onClick={() => setCurrentIndex((prev) => Math.min(total - 1, prev + 1))}
          icon={<ChevronRight className="w-4 h-4" />}
        >
          Próxima
        </M3Button>
      </div>

      {/* Question Review to Flashcards Modal */}
      {showReviewModal && (
        <QuestionReviewToFlashcardsView
          questionSet={activeQuestionSet}
          onClose={() => setShowReviewModal(false)}
        />
      )}
    </div>
  );
};
