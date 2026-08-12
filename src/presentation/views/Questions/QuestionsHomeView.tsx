import React from 'react';
import { motion } from 'motion/react';
import { useQuestionViewModel } from '../../viewmodels/useQuestionViewModel';
import { useDevice } from '../../../core/responsive/DeviceContext';
import { M3Card } from '../../components/Material3/M3Card';
import { M3Button } from '../../components/Material3/M3Button';
import {
  HelpCircle,
  PlusCircle,
  Users,
  Search,
  Sparkles,
  BookOpen,
  CheckCircle2,
  XCircle,
  Trash2,
  Share2,
  FileText,
  Layers,
  ArrowRight,
  GraduationCap,
  Award,
  BarChart2,
  FolderArchive,
  RefreshCw,
} from 'lucide-react';

interface QuestionsHomeViewProps {
  onNavigateToGenerate: () => void;
  onNavigateToProfiles: () => void;
  onNavigateToPractice: (setId: string) => void;
}

export const QuestionsHomeView: React.FC<QuestionsHomeViewProps> = ({
  onNavigateToGenerate,
  onNavigateToProfiles,
  onNavigateToPractice,
}) => {
  const { colors } = useDevice();
  const {
    questionSets,
    professorProfiles,
    examProfiles,
    loading,
    searchQuery,
    setSearchQuery,
    deleteQuestionSet,
    exportQuestionsToFlashcards,
    setActiveQuestionSet,
    setCurrentStep,
  } = useQuestionViewModel();

  const filteredSets = questionSets.filter((set) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      set.title.toLowerCase().includes(q) ||
      set.request.configuration.specialty.toLowerCase().includes(q) ||
      (set.request.bancaName && set.request.bancaName.toLowerCase().includes(q)) ||
      (set.request.professorName && set.request.professorName.toLowerCase().includes(q))
    );
  });

  const totalQuestionsGenerated = questionSets.reduce((sum, s) => sum + s.totalQuestions, 0);
  const totalAnswered = questionSets.reduce((sum, s) => sum + s.answeredCount, 0);
  const totalCorrect = questionSets.reduce((sum, s) => sum + s.correctCount, 0);
  const overallAccuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  const handleExport = async (setId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await exportQuestionsToFlashcards(setId);
      alert('Questões convertidas em Flashcards no seu Baralho do MedAnki com sucesso!');
    } catch (err: any) {
      alert(err.message || 'Erro ao exportar questões.');
    }
  };

  const handleDelete = async (setId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Deseja realmente excluir este lote de questões?')) {
      await deleteQuestionSet(setId);
    }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      {/* Hero Stats Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-3xl p-3.5 sm:p-5 md:p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-6 transition-all max-w-full overflow-hidden"
        style={{
          backgroundColor: colors.primaryContainer,
          color: colors.onPrimaryContainer,
        }}
      >
        <div className="space-y-1.5 min-w-0 flex-1 w-full">
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold shadow-xs max-w-full"
            style={{ backgroundColor: colors.secondaryContainer, color: colors.onSecondaryContainer }}
          >
            <HelpCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Módulo de Questões Inéditas MedAnki</span>
          </div>
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight leading-tight">
            Banco de Questões & Simulados
          </h2>
          <p className="text-xs sm:text-sm opacity-90 max-w-xl leading-snug line-clamp-2 sm:line-clamp-none">
            Treine com questões no estilo oficial das principais bancas de Residência Médica ou geradas pelo estilo de elaboração dos seus professores.
          </p>
        </div>

        {/* Global Summary Stats */}
        <div className="grid grid-cols-3 gap-2 w-full md:w-auto shrink-0 pt-2.5 md:pt-0 border-t md:border-t-0 border-white/10">
          <div className="p-2 sm:p-3 rounded-2xl bg-white/30 dark:bg-black/20 backdrop-blur-sm text-center min-w-0 border border-white/10">
            <div className="text-base sm:text-lg md:text-xl font-black">{totalQuestionsGenerated}</div>
            <div className="text-[10px] sm:text-[11px] font-semibold opacity-80 truncate">Geradas</div>
          </div>
          <div className="p-2 sm:p-3 rounded-2xl bg-white/30 dark:bg-black/20 backdrop-blur-sm text-center min-w-0 border border-white/10">
            <div className="text-base sm:text-lg md:text-xl font-black">{professorProfiles.length}</div>
            <div className="text-[10px] sm:text-[11px] font-semibold opacity-80 truncate">Professores</div>
          </div>
          <div className="p-2 sm:p-3 rounded-2xl bg-white/30 dark:bg-black/20 backdrop-blur-sm text-center min-w-0 border border-white/10">
            <div className="text-base sm:text-lg md:text-xl font-black text-emerald-400">{overallAccuracy}%</div>
            <div className="text-[10px] sm:text-[11px] font-semibold opacity-80 truncate">Precisão</div>
          </div>
        </div>
      </motion.div>

      {/* Main Action Hub Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Card 1: Gerar Novas Questões */}
        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
          <M3Card
            variant="filled"
            onClick={onNavigateToGenerate}
            className="p-5 cursor-pointer flex items-center justify-between group transition-all border border-indigo-500/20 hover:border-indigo-500/50"
            style={{ backgroundColor: colors.surfaceContainerHigh }}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center text-white shadow-md">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold group-hover:text-indigo-400 transition-colors">
                  Gerar Questões
                </h3>
                <p className="text-xs opacity-75 mt-0.5">
                  Por Banca (ENARE, USP, etc.) ou Perfil de Professor
                </p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-indigo-400 group-hover:translate-x-1 transition-transform" />
          </M3Card>
        </motion.div>

        {/* Card 2: Gerenciar Perfis de Professor */}
        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
          <M3Card
            variant="filled"
            onClick={onNavigateToProfiles}
            className="p-5 cursor-pointer flex items-center justify-between group transition-all border border-purple-500/20 hover:border-purple-500/50"
            style={{ backgroundColor: colors.surfaceContainerHigh }}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center text-white shadow-md">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold group-hover:text-purple-400 transition-colors">
                  Perfis de Professor
                </h3>
                <p className="text-xs opacity-75 mt-0.5">
                  {professorProfiles.length} perfil(is) cadastrado(s) com provas
                </p>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-purple-400 group-hover:translate-x-1 transition-transform" />
          </M3Card>
        </motion.div>
      </div>

      {/* Instant Search Bar */}
      <div className="flex items-center justify-between gap-3">
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-full border flex-1 transition-all focus-within:ring-2 focus-within:ring-indigo-500/50"
          style={{
            backgroundColor: colors.surfaceContainer,
            borderColor: colors.outlineVariant,
          }}
        >
          <Search className="w-4 h-4 shrink-0 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por especialidade, banca ou professor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-sm border-none outline-none w-full"
            style={{ color: colors.onSurface }}
          />
        </div>
      </div>

      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-400" />
          <span>Seus Simulados e Lotes de Questões ({filteredSets.length})</span>
        </h3>
      </div>

      {/* Loading Skeleton View */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-2xl p-5 border border-white/10 bg-white/5 animate-pulse space-y-3"
            >
              <div className="w-1/3 h-4 bg-white/10 rounded"></div>
              <div className="w-3/4 h-5 bg-white/10 rounded"></div>
              <div className="w-full h-8 bg-white/10 rounded"></div>
            </div>
          ))}
        </div>
      ) : filteredSets.length === 0 ? (
        /* Empty State */
        <M3Card className="text-center py-12 space-y-3">
          <HelpCircle className="w-12 h-12 mx-auto opacity-30 text-indigo-400" />
          <h4 className="text-base font-bold">Nenhum simulado de questões gerado</h4>
          <p className="text-xs opacity-75 max-w-md mx-auto">
            Gere seu primeiro lote de questões baseadas nas principais bancas de Residência ou envie as provas do seu professor.
          </p>
          <div className="pt-2">
            <M3Button variant="filled" icon={<PlusCircle className="w-4 h-4" />} onClick={onNavigateToGenerate}>
              Gerar Primeiro Simulado
            </M3Button>
          </div>
        </M3Card>
      ) : (
        /* Question Sets List */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSets.map((set) => {
            const progress =
              set.totalQuestions > 0
                ? Math.round((set.answeredCount / set.totalQuestions) * 100)
                : 0;
            const accuracy =
              set.answeredCount > 0
                ? Math.round((set.correctCount / set.answeredCount) * 100)
                : 0;

            const modeLabel =
              set.request.mode === 'banca'
                ? `Banca: ${set.request.bancaName || 'Não especificada'}`
                : `Prof: ${set.request.professorName || 'Personalizado'}`;

            return (
              <M3Card
                key={set.id}
                variant="outlined"
                className="p-5 flex flex-col justify-between space-y-4 hover:border-indigo-500/40 transition-all cursor-pointer group"
                onClick={() => {
                  setActiveQuestionSet(set);
                  onNavigateToPractice(set.id);
                }}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                      {set.request.configuration.specialty}
                    </span>
                    <span className="text-[10px] font-semibold opacity-60">
                      {new Date(set.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>

                  <h4 className="text-base font-bold group-hover:text-indigo-400 transition-colors line-clamp-1">
                    {set.title}
                  </h4>

                  <div className="flex items-center gap-2 text-xs opacity-75">
                    <Award className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{modeLabel}</span>
                  </div>

                  {/* Progress & Accuracy Bar */}
                  <div className="space-y-1 pt-2">
                    <div className="flex items-center justify-between text-[11px] font-semibold opacity-80">
                      <span>Respondidas: {set.answeredCount}/{set.totalQuestions}</span>
                      <span>Acerto: {accuracy}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-indigo-500 to-emerald-400"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <div className="flex items-center gap-2">
                    <M3Button
                      variant="filled"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveQuestionSet(set);
                        onNavigateToPractice(set.id);
                      }}
                    >
                      {set.answeredCount > 0 ? 'Continuar' : 'Iniciar'}
                    </M3Button>

                    <button
                      onClick={(e) => handleExport(set.id, e)}
                      title="Gerar Flashcards no Baralho"
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-cyan-400 transition-colors"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    onClick={(e) => handleDelete(set.id, e)}
                    title="Excluir Simulado"
                    className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </M3Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
