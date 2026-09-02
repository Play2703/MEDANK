import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useQuestionViewModel } from '../../viewmodels/useQuestionViewModel';
import { useDevice } from '../../../core/responsive/DeviceContext';
import { M3Card } from '../../components/Material3/M3Card';
import { M3Button } from '../../components/Material3/M3Button';
import { DocumentPickerService } from '../../../data/services/DocumentPickerService';
import {
  BASIC_CYCLE_SPECIALTIES,
  CLINICAL_CYCLE_SPECIALTIES,
  CURRICULUM_GROUPS,
  CURRICULUM_TOPICS_BY_SPECIALTY,
  SUBTOPICS_BY_TOPIC,
  getSubtopicsForTopic,
} from '../../../data/curriculumTopics';
import {
  calculateAutoTopicDistribution,
  estimateTopicDiversityCapacity,
} from '../../../data/services/QuestionGenerationService';
import { segmentContextIntoCoverageUnits } from '../../../data/services/contextSegmentation';
import {
  GenerationMode,
  DistributionMode,
  QuestionDifficulty,
  QuestionType,
  QuestionConfiguration,
  QuestionGenerationRequest,
  ImportedDocument,
  CoverageUnit,
} from '../../../domain/entities/Question';
import {
  Sparkles,
  Award,
  GraduationCap,
  ArrowLeft,
  Upload,
  FileText,
  Trash2,
  Plus,
  Minus,
  Info,
  CheckCircle,
  Sliders,
  BookOpen,
  Check,
  Zap,
  Building2,
  AlertTriangle,
  ShieldCheck,
  Search,
  Layers,
  PieChart,
  Settings2,
  Layers3,
  Microscope,
  Stethoscope,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Tag,
  X,
} from 'lucide-react';


interface GenerateQuestionsViewProps {
  onBack: () => void;
  onQuestionsGenerated: () => void;
}

const BAR_COLOR_PALETTE = [
  'bg-indigo-500',
  'bg-purple-500',
  'bg-cyan-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-fuchsia-500',
];

export const GenerateQuestionsView: React.FC<GenerateQuestionsViewProps> = ({
  onBack,
  onQuestionsGenerated,
}) => {
  const { colors } = useDevice();
  const {
    importedExamBoards,
    importedProfessors,
    professorProfiles,
    knowledgeBaseStats,
    generateQuestions,
    isGenerating,
    lowChunkWarning,
    clearLowChunkWarning,
    confirmProceedWithLowChunks,
    prefilledConfiguration,
    setPrefilledConfiguration,
    refresh,
  } = useQuestionViewModel();

  const pickerService = new DocumentPickerService();

  useEffect(() => {
    refresh();
  }, []);

  // Selected Mode: 'geral' | 'banca' | 'professor'
  const [mode, setMode] = useState<GenerationMode>('geral');

  // Banca Selection
  const [selectedBancaName, setSelectedBancaName] = useState<string>('');

  // Professor Selection
  const [selectedProfName, setSelectedProfName] = useState<string>('');

  // Custom Context Free Text (Study Notes / Custom Source Material)
  const [customContext, setCustomContext] = useState<string>('');
  const [strictCustomContextOnly, setStrictCustomContextOnly] = useState<boolean>(true);
  const [detectedCoverageUnits, setDetectedCoverageUnits] = useState<CoverageUnit[]>([]);

  // Pre-generation Topic Diversity Capacity Advisory Modal
  const [diversityWarningModal, setDiversityWarningModal] = useState<{
    limitedTopics: Array<{ topic: string; capacity: number; requested: number; reason: string }>;
    totalCapacity: number;
    request: QuestionGenerationRequest;
  } | null>(null);

  useEffect(() => {
    if (!customContext.trim()) {
      setDetectedCoverageUnits([]);
      return;
    }
    const timer = setTimeout(() => {
      segmentContextIntoCoverageUnits(customContext)
        .then((units) => setDetectedCoverageUnits(units))
        .catch(() => setDetectedCoverageUnits([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [customContext]);

  useEffect(() => {
    if (prefilledConfiguration) {
      if (prefilledConfiguration.customContext) {
        setCustomContext(prefilledConfiguration.customContext);
      }
      if (prefilledConfiguration.specialty) {
        setSelectedSpecialties([prefilledConfiguration.specialty]);
      } else if (prefilledConfiguration.specialties && prefilledConfiguration.specialties.length > 0) {
        setSelectedSpecialties(prefilledConfiguration.specialties);
      }
      if (prefilledConfiguration.topics && prefilledConfiguration.topics.length > 0) {
        setSelectedTopics(prefilledConfiguration.topics);
      }
      // Limpa após ler para não sobrescrever caso o usuário navegue manualmente depois
      setPrefilledConfiguration(null);
    }
  }, [prefilledConfiguration]);

  useEffect(() => {
    if (importedExamBoards.length > 0 && !selectedBancaName) {
      setSelectedBancaName(importedExamBoards[0].name);
    }
  }, [importedExamBoards]);

  useEffect(() => {
    if (importedProfessors.length > 0 && !selectedProfName) {
      setSelectedProfName(importedProfessors[0].name);
    }
  }, [importedProfessors]);

  // Multi-Specialty Selection
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>(['Clínica Médica']);
  const [selectedTopics, setSelectedTopics] = useState<string[]>(['Insuficiência Cardíaca Aguda e Crônica']);
  const [topicSearchFilter, setTopicSearchFilter] = useState<string>('');
  const [subtopic, setSubtopic] = useState<string>('Manejo Terapêutico');
  const [quantity, setQuantity] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>('media');
  const [questionType, setQuestionType] = useState<QuestionType>('caso_clinico');
  const [includeCommentary, setIncludeCommentary] = useState<boolean>(true);
  const [showReferences, setShowReferences] = useState<boolean>(true);
  const [autoGenerateFlashcards, setAutoGenerateFlashcards] = useState<boolean>(false);
  const [prioritizeLocalQuestions, setPrioritizeLocalQuestions] = useState<boolean>(false);

  // Accordion state for cycles
  const [isBasicCycleOpen, setIsBasicCycleOpen] = useState<boolean>(true);
  const [isClinicalCycleOpen, setIsClinicalCycleOpen] = useState<boolean>(true);

  // Distribution Mode state
  const [distributionMode, setDistributionMode] = useState<DistributionMode>('interdisciplinar');
  const [isManualDistribution, setIsManualDistribution] = useState<boolean>(false);
  const [customQuantities, setCustomQuantities] = useState<Record<string, number>>({});

  // Topics grouped by their origin specialty for clean UI presentation
  const topicsGroupedBySpecialty = useMemo(() => {
    const map: Record<string, string[]> = {};
    selectedSpecialties.forEach((spec) => {
      const allForSpec = CURRICULUM_TOPICS_BY_SPECIALTY[spec] || ['Geral'];
      // Topics selected for this spec
      const selectedForSpec = allForSpec.filter((t) => selectedTopics.includes(t));
      map[spec] = allForSpec;
    });
    return map;
  }, [selectedSpecialties, selectedTopics]);

  // Dictionary mapping each topic to its origin specialty
  const topicSpecialtyMap = useMemo(() => {
    const map: Record<string, string> = {};
    selectedSpecialties.forEach((spec) => {
      const topics = CURRICULUM_TOPICS_BY_SPECIALTY[spec] || ['Geral'];
      topics.forEach((tp) => {
        map[tp] = spec;
      });
    });
    return map;
  }, [selectedSpecialties]);

  // Automatic distribution preview
  const autoDistribution = useMemo(() => {
    return calculateAutoTopicDistribution(quantity, selectedTopics);
  }, [quantity, selectedTopics]);

  // Effective distribution allocation map (auto or manual)
  const currentAllocation = useMemo(() => {
    if (isManualDistribution) {
      return customQuantities;
    }
    return autoDistribution;
  }, [isManualDistribution, customQuantities, autoDistribution]);

  // Initialize/update manual distribution defaults when topics/quantity change
  useEffect(() => {
    const nextManual: Record<string, number> = {};
    const auto = calculateAutoTopicDistribution(quantity, selectedTopics);
    selectedTopics.forEach((t) => {
      nextManual[t] = customQuantities[t] ?? auto[t] ?? 1;
    });
    setCustomQuantities(nextManual);
  }, [selectedTopics, quantity]);

  // Calculate sum of manual allocations
  const manualSum = useMemo(() => {
    return selectedTopics.reduce((sum, t) => sum + (customQuantities[t] || 0), 0);
  }, [selectedTopics, customQuantities]);

  const isManualSumValid = useMemo(() => {
    if (!isManualDistribution || distributionMode === 'interdisciplinar') return true;
    return manualSum === quantity;
  }, [isManualDistribution, distributionMode, manualSum, quantity]);

  // Subtopics (specific topics refinement) state
  const [isSubtopicsPanelOpen, setIsSubtopicsPanelOpen] = useState<boolean>(false);
  const [selectedSubtopics, setSelectedSubtopics] = useState<string[]>([]);
  const [subtopicFilterText, setSubtopicFilterText] = useState<string>('');

  // Map of available subtopics per selected topic
  const availableSubtopicsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    selectedTopics.forEach((tp) => {
      const spec = topicSpecialtyMap[tp] || selectedSpecialties[0];
      const subs = getSubtopicsForTopic(spec, tp);
      if (subs && subs.length > 0) {
        map[tp] = subs;
      }
    });
    return map;
  }, [selectedTopics, topicSpecialtyMap, selectedSpecialties]);

  const totalAvailableSubtopicsCount = useMemo(() => {
    return Object.values(availableSubtopicsMap).reduce((acc, list) => acc + list.length, 0);
  }, [availableSubtopicsMap]);

  const toggleSpecialty = (spec: string) => {
    if (selectedSpecialties.includes(spec)) {
      if (selectedSpecialties.length > 1) {
        const nextSpecs = selectedSpecialties.filter((s) => s !== spec);
        setSelectedSpecialties(nextSpecs);

        const remainingTopics = selectedTopics.filter((t) => {
          return topicSpecialtyMap[t] !== spec;
        });

        if (remainingTopics.length > 0) {
          setSelectedTopics(remainingTopics);
        } else {
          const firstSpec = nextSpecs[0];
          const firstTopic = (CURRICULUM_TOPICS_BY_SPECIALTY[firstSpec] || ['Geral'])[0];
          setSelectedTopics([firstTopic]);
        }
      }
    } else {
      setSelectedSpecialties([...selectedSpecialties, spec]);
    }
  };

  const toggleTopic = (topicName: string) => {
    setSelectedTopics((prev) => {
      if (prev.includes(topicName)) {
        if (prev.length > 1) {
          const spec = topicSpecialtyMap[topicName] || selectedSpecialties[0];
          const subsForThisTopic = new Set(getSubtopicsForTopic(spec, topicName));
          setSelectedSubtopics((subPrev) => subPrev.filter((s) => !subsForThisTopic.has(s)));
          return prev.filter((t) => t !== topicName);
        }
        return prev;
      } else {
        return [...prev, topicName];
      }
    });
  };

  const toggleSubtopic = (sub: string) => {
    setSelectedSubtopics((prev) =>
      prev.includes(sub) ? prev.filter((s) => s !== sub) : [...prev, sub]
    );
  };

  const handleManualQuantityChange = (topic: string, delta: number) => {
    setCustomQuantities((prev) => {
      const current = prev[topic] ?? 0;
      return {
        ...prev,
        [topic]: Math.max(0, current + delta),
      };
    });
  };

  const handleManualQuantityInput = (topic: string, val: number) => {
    setCustomQuantities((prev) => ({
      ...prev,
      [topic]: Math.max(0, val),
    }));
  };

  const handleGenerate = async () => {
    if (mode === 'banca' && !selectedBancaName && importedExamBoards.length > 0) {
      setSelectedBancaName(importedExamBoards[0].name);
    }

    if (mode === 'professor' && !selectedProfName && importedProfessors.length > 0) {
      setSelectedProfName(importedProfessors[0].name);
    }

    if (!isManualSumValid) {
      alert(`A soma das questões por assunto (${manualSum}) deve ser exatamente igual ao total de questões (${quantity}).`);
      return;
    }

    try {
      const topicSubtopicsMap: Record<string, string[]> = {};
      for (const tp of selectedTopics) {
        const spec = topicSpecialtyMap[tp] || selectedSpecialties[0];
        const allSubsForTopic = getSubtopicsForTopic(spec, tp);
        const matchedSubs = selectedSubtopics.filter((s) => allSubsForTopic.includes(s));
        if (matchedSubs.length > 0) {
          topicSubtopicsMap[tp] = matchedSubs;
        }
      }

      const config: QuestionConfiguration = {
        specialty: selectedSpecialties[0],
        specialties: selectedSpecialties,
        topics: selectedTopics,
        topicSpecialtyMap,
        subtopic,
        selectedSubtopics: selectedSubtopics.length > 0 ? selectedSubtopics : undefined,
        topicSubtopicsMap: Object.keys(topicSubtopicsMap).length > 0 ? topicSubtopicsMap : undefined,
        quantity,
        distributionMode,
        customTopicQuantities: isManualDistribution ? customQuantities : undefined,
        difficulty,
        questionType,
        includeCommentary,
        showReferences,
        autoGenerateFlashcards,
        prioritizeLocalQuestions,
        customContext: customContext.trim() || undefined,
        strictCustomContextOnly: customContext.trim() ? strictCustomContextOnly : undefined,
      };


      const matchingProf = mode === 'professor' ? professorProfiles.find((p) => p.name === selectedProfName) : undefined;

      const request: QuestionGenerationRequest = {
        id: `req-${Date.now()}`,
        mode,
        bancaName: mode === 'banca' ? selectedBancaName : undefined,
        professorName: mode === 'professor' ? selectedProfName : undefined,
        professorProfileId: matchingProf?.id,
        configuration: config,
        createdAt: new Date().toISOString(),
      };

      // Verificação prévia de capacidade de diversidade
      const topicsToCheck = selectedTopics.length > 0 ? selectedTopics : ['Geral'];
      const limitedItems: Array<{ topic: string; capacity: number; requested: number; reason: string }> = [];
      let calculatedCapacitySum = 0;

      for (const tp of topicsToCheck) {
        const cap = estimateTopicDiversityCapacity(tp, customContext.trim() || undefined);
        const requestedForTopic = isManualDistribution && customQuantities[tp] !== undefined
          ? customQuantities[tp]
          : Math.max(1, Math.round(quantity / topicsToCheck.length));

        calculatedCapacitySum += cap.capacity;

        if (cap.isLimited && requestedForTopic > cap.capacity) {
          limitedItems.push({
            topic: tp,
            capacity: cap.capacity,
            requested: requestedForTopic,
            reason: cap.reason,
          });
        }
      }

      if (limitedItems.length > 0) {
        setDiversityWarningModal({
          limitedTopics: limitedItems,
          totalCapacity: Math.max(1, calculatedCapacitySum),
          request,
        });
        return;
      }

      const result = await generateQuestions(request);
      if (result) {
        onQuestionsGenerated();
      }
    } catch (err: any) {
      alert(err.message || 'Erro ao gerar simulado.');
    }
  };

  // Helper count selected in cycle
  const basicSelectedCount = selectedSpecialties.filter((s) => BASIC_CYCLE_SPECIALTIES.includes(s)).length;
  const clinicalSelectedCount = selectedSpecialties.filter((s) => CLINICAL_CYCLE_SPECIALTIES.includes(s)).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-6">
      {/* Header with Back Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-100">Gerar Simulado de Questões via RAG</h2>
          <p className="text-xs text-slate-300 opacity-90">
            Questões inéditas de altíssima qualidade ancoradas em materiais e exames reais importados
          </p>
        </div>
      </div>

      {/* Indicator Card for Knowledge Base Stats (Requirement 6) */}
      <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-sm text-indigo-200">
              Base de Conhecimento Geral Ativa
            </div>
            <div className="text-slate-300 opacity-90 text-[11px] mt-0.5">
              <strong>{knowledgeBaseStats.totalDocuments}</strong> documento(s) e <strong>{knowledgeBaseStats.totalChunks}</strong> trecho(s) indexados na base semântica RAG
            </div>
          </div>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold shrink-0">
          Pesquisa automática em toda a base
        </span>
      </div>

      {/* Mode Switcher Toggle Pill (Requirement 1 & 2) */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
          <span>Origem do Material (RAG)</span>
          <span className="text-[10px] text-indigo-400 font-normal">
            Banca e Professor são filtros OPCIONAIS
          </span>
        </label>

        <div
          className="p-1.5 rounded-2xl flex flex-col sm:flex-row items-center gap-2 border"
          style={{
            backgroundColor: colors.surfaceContainerHigh,
            borderColor: colors.outlineVariant,
          }}
        >
          <button
            onClick={() => setMode('geral')}
            className={`w-full sm:flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
              mode === 'geral'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Base Geral (Toda a Base)</span>
          </button>

          <button
            onClick={() => setMode('banca')}
            className={`w-full sm:flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
              mode === 'banca'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Filtrar por Banca ({importedExamBoards.length})</span>
          </button>

          <button
            onClick={() => setMode('professor')}
            className={`w-full sm:flex-1 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
              mode === 'professor'
                ? 'bg-purple-600 text-white shadow-md'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Filtrar por Prof. ({importedProfessors.length})</span>
          </button>
        </div>
      </div>

      {/* Mode Details: General Mode */}
      {mode === 'geral' && (
        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-200 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed text-[11px] space-y-1">
            <p>
              <strong>Modo Geral Ativo (Padrão):</strong> A geração pesquisará automaticamente <strong>toda a base de conhecimento</strong> (livros, artigos, diretrizes, protocolos, apostilas e provas) sem exigir nenhuma seleção prévia de banca ou professor.
            </p>
            <p className="opacity-80">
              Quanto mais materiais forem alimentados no Developer Console, mais rica, precisa e inteligente se torna a geração de questões.
            </p>
          </div>
        </motion.div>
      )}

      {/* Mode 1: Baseado em Banca */}
      {mode === 'banca' && (
        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              Bancas com Materiais e Provas Importadas
            </label>

            {importedExamBoards.length === 0 ? (
              <div className="p-8 rounded-3xl border border-dashed border-indigo-500/30 text-center space-y-3 bg-indigo-500/5">
                <Building2 className="w-12 h-12 mx-auto text-indigo-400 opacity-60" />
                <h4 className="text-base font-bold">Nenhuma banca com material importado ainda</h4>
                <p className="text-xs opacity-75 max-w-md mx-auto">
                  Se você deseja restringir ao estilo de uma banca, importe o PDF de uma prova real no Developer Console informando a banca. Caso contrário, você pode gerar normalmente no modo <strong>Base Geral</strong> acima!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {importedExamBoards.map((banca) => {
                  const isSelected = selectedBancaName === banca.name;
                  return (
                    <div
                      key={banca.name}
                      onClick={() => setSelectedBancaName(banca.name)}
                      className={`p-4 rounded-2xl border text-left cursor-pointer transition-all flex items-center justify-between ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/30'
                          : 'border-white/10 hover:border-white/20 bg-white/5'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-sm text-indigo-300">{banca.name}</div>
                        <div className="text-[11px] opacity-75 mt-0.5">
                          {banca.chunkCount} trechos/chunks indexados
                        </div>
                      </div>
                      {isSelected && <Check className="w-5 h-5 text-indigo-400 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-200 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed text-[11px]">
              <strong>Filtro de Banca Ativo:</strong> A IA utilizará os trechos reais recuperados da banca selecionada como referência de formato, extensão de enunciado e estilo de distratores.
            </p>
          </div>
        </motion.div>
      )}

      {/* Mode 2: Baseado em Professor */}
      {mode === 'professor' && (
        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-purple-400">
              Professores com Materiais Importados
            </label>

            {importedProfessors.length === 0 ? (
              <div className="p-8 rounded-3xl border border-dashed border-purple-500/30 text-center space-y-3 bg-purple-500/5">
                <GraduationCap className="w-12 h-12 mx-auto text-purple-400 opacity-60" />
                <h4 className="text-base font-bold">Nenhum professor com material importado ainda</h4>
                <p className="text-xs opacity-75 max-w-md mx-auto">
                  Importe as provas ou apostilas do seu professor no Developer Console informando o nome dele. Ou altere para a <strong>Base Geral</strong> para usar todos os materiais.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {importedProfessors.map((prof) => {
                  const isSelected = selectedProfName === prof.name;
                  return (
                    <div
                      key={prof.name}
                      onClick={() => setSelectedProfName(prof.name)}
                      className={`p-4 rounded-2xl border text-left cursor-pointer transition-all flex items-center justify-between ${
                        isSelected
                          ? 'border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/30'
                          : 'border-white/10 hover:border-white/20 bg-white/5'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-sm text-purple-300">Prof. {prof.name}</div>
                        <div className="text-[11px] opacity-75 mt-0.5">
                          {prof.chunkCount} trechos/chunks indexados
                        </div>
                      </div>
                      {isSelected && <Check className="w-5 h-5 text-purple-400 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Configurações Comuns */}
      <M3Card variant="outlined" className="p-6 space-y-6">
        <h3 className="text-base font-bold flex items-center gap-2 border-b border-white/10 pb-3">
          <Sliders className="w-5 h-5 text-indigo-400" />
          <span>Configurações do Simulado e Currículo Médico</span>
        </h3>

        {/* MODO DE DISTRIBUIÇÃO DAS QUESTÕES (INTERDISCIPLINAR VS DISTRIBUÍDO) */}
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-indigo-400" />
            <span>Modo de Integração / Distribuição das Questões</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <motion.div
              whileTap={{ scale: 0.98 }}
              onClick={() => setDistributionMode('interdisciplinar')}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                distributionMode === 'interdisciplinar'
                  ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/30'
                  : 'border-white/10 hover:border-white/20 bg-white/5'
              }`}
            >
              <div className="flex items-center justify-between font-bold text-sm text-indigo-300">
                <span className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  Questão Interdisciplinar
                </span>
                {distributionMode === 'interdisciplinar' && <Check className="w-4 h-4 text-indigo-400" />}
              </div>
              <p className="text-xs opacity-75 mt-1.5 leading-relaxed">
                Cada questão é um <strong>caso clínico unificado</strong> que integra ativamente as múltiplas especialidades e assuntos selecionados em uma única situação de tomada de decisão.
              </p>
            </motion.div>

            <motion.div
              whileTap={{ scale: 0.98 }}
              onClick={() => setDistributionMode('distribuido')}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                distributionMode === 'distribuido'
                  ? 'border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/30'
                  : 'border-white/10 hover:border-white/20 bg-white/5'
              }`}
            >
              <div className="flex items-center justify-between font-bold text-sm text-purple-300">
                <span className="flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-purple-400" />
                  Simulado Distribuído
                </span>
                {distributionMode === 'distribuido' && <Check className="w-4 h-4 text-purple-400" />}
              </div>
              <p className="text-xs opacity-75 mt-1.5 leading-relaxed">
                Lote de <strong>{quantity} questões</strong> divididas entre os assuntos selecionados das disciplinas. Cada questão é focada exclusivamente em 1 único assunto de sua especialidade.
              </p>
            </motion.div>
          </div>
        </div>

        {/* OBJETIVO 1: SELEÇÃO COM HIERARQUIA VISUAL E ACCORDION EXPANSÍVEL POR CICLO */}
        <div className="space-y-4 pt-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Layers3 className="w-4 h-4 text-indigo-400" />
              Disciplinas do Currículo Médico ({selectedSpecialties.length} selecionada(s))
            </span>
            <span className="text-[10px] text-indigo-400 font-normal">Ciclo Básico (Cian) & Ciclo Clínico (Índigo)</span>
          </label>

          {/* Grupo 1: CICLO BÁSICO */}
          <div className="rounded-2xl border border-cyan-500/30 bg-cyan-950/20 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setIsBasicCycleOpen(!isBasicCycleOpen)}
              className="w-full px-4 py-3 flex items-center justify-between bg-cyan-500/10 hover:bg-cyan-500/15 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <Microscope className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="font-bold text-sm text-cyan-300 tracking-wide uppercase">Ciclo Básico</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 font-semibold">
                  {basicSelectedCount} selecionada(s)
                </span>
              </div>
              {isBasicCycleOpen ? <ChevronUp className="w-4 h-4 text-cyan-400" /> : <ChevronDown className="w-4 h-4 text-cyan-400" />}
            </button>

            <AnimatePresence>
              {isBasicCycleOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="p-3 border-t border-cyan-500/20"
                >
                  <div className="flex flex-wrap gap-2">
                    {BASIC_CYCLE_SPECIALTIES.map((spec) => {
                      const isSelected = selectedSpecialties.includes(spec);
                      return (
                        <motion.button
                          key={spec}
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          onClick={() => toggleSpecialty(spec)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-cyan-600 text-white border-cyan-400 shadow-md ring-2 ring-cyan-500/30'
                              : 'bg-black/30 border-cyan-500/20 text-cyan-200/80 hover:text-cyan-100 hover:bg-cyan-500/10'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                          <span>{spec}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Grupo 2: CICLO CLÍNICO */}
          <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setIsClinicalCycleOpen(!isClinicalCycleOpen)}
              className="w-full px-4 py-3 flex items-center justify-between bg-indigo-500/10 hover:bg-indigo-500/15 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="font-bold text-sm text-indigo-300 tracking-wide uppercase">Ciclo Clínico</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 font-semibold">
                  {clinicalSelectedCount} selecionada(s)
                </span>
              </div>
              {isClinicalCycleOpen ? <ChevronUp className="w-4 h-4 text-indigo-400" /> : <ChevronDown className="w-4 h-4 text-indigo-400" />}
            </button>

            <AnimatePresence>
              {isClinicalCycleOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="p-3 border-t border-indigo-500/20"
                >
                  <div className="flex flex-wrap gap-2">
                    {CLINICAL_CYCLE_SPECIALTIES.map((spec) => {
                      const isSelected = selectedSpecialties.includes(spec);
                      return (
                        <motion.button
                          key={spec}
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          onClick={() => toggleSpecialty(spec)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-400 shadow-md ring-2 ring-indigo-500/30'
                              : 'bg-black/30 border-indigo-500/20 text-indigo-200/80 hover:text-indigo-100 hover:bg-indigo-500/10'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                          <span>{spec}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Subtema Livre */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Subtema / Foco Específico (Opcional)
          </label>
          <input
            type="text"
            value={subtopic}
            onChange={(e) => setSubtopic(e.target.value)}
            placeholder="Ex: Manejo Terapêutico, Diagnósticos, Fisiopatologia"
            className="w-full px-3.5 py-2.5 rounded-xl bg-black/20 border border-white/10 text-sm outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* OBJETIVO 2: CHIPS AGRUPADOS LIMPOS POR ESPECIALIDADE (SEM BADGE REPETIDO) */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-400" />
              <span>Assuntos Selecionados ({selectedTopics.length} selecionado(s))</span>
            </label>

            <div className="relative max-w-xs w-full">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
              <input
                type="text"
                value={topicSearchFilter}
                onChange={(e) => setTopicSearchFilter(e.target.value)}
                placeholder="Filtrar assuntos..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto p-4 rounded-2xl bg-black/30 border border-white/10 space-y-4">
            {selectedSpecialties.map((spec) => {
              const allForSpec = CURRICULUM_TOPICS_BY_SPECIALTY[spec] || ['Geral'];
              const filteredForSpec = topicSearchFilter.trim()
                ? allForSpec.filter((t) => t.toLowerCase().includes(topicSearchFilter.toLowerCase()))
                : allForSpec;

              if (filteredForSpec.length === 0) return null;

              const isBasic = BASIC_CYCLE_SPECIALTIES.includes(spec);

              return (
                <div key={spec} className="space-y-2">
                  <h5 className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-1 text-slate-300">
                    {isBasic ? <Microscope className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> : <Stethoscope className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                    <span>{spec}</span>
                  </h5>

                  <div className="flex flex-wrap gap-2">
                    {filteredForSpec.map((tp) => {
                      const isSelected = selectedTopics.includes(tp);
                      return (
                        <motion.button
                          key={tp}
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          onClick={() => toggleTopic(tp)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all text-left flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-400 shadow-xs'
                              : 'bg-white/5 border-white/10 opacity-75 hover:opacity-100 hover:bg-white/10'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-white" />}
                          <span>{tp}</span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Painel Colapsado: Refinar por tema específico (opcional) */}
          {totalAvailableSubtopicsCount > 0 && (
            <div className="rounded-2xl border border-purple-500/20 bg-purple-950/10 overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => setIsSubtopicsPanelOpen((prev) => !prev)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Tag className="w-4 h-4 text-purple-400 shrink-0" />
                  <span className="text-xs font-semibold text-slate-200">
                    Refinar por tema específico (opcional)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    ({totalAvailableSubtopicsCount} temas disponíveis)
                  </span>
                  {selectedSubtopics.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                      {selectedSubtopics.length} selecionado(s)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0 ml-2">
                  <span>{isSubtopicsPanelOpen ? 'Ocultar' : 'Expandir'}</span>
                  {isSubtopicsPanelOpen ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </button>

              <AnimatePresence>
                {isSubtopicsPanelOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-4 pt-2 border-t border-purple-500/20 space-y-3"
                  >
                    {/* Barra de busca interna quando houver mais de 8 subtópicos */}
                    {totalAvailableSubtopicsCount > 8 && (
                      <div className="relative w-full">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
                        <input
                          type="text"
                          value={subtopicFilterText}
                          onChange={(e) => setSubtopicFilterText(e.target.value)}
                          placeholder="Filtrar temas específicos..."
                          className="w-full pl-8 pr-8 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs outline-none focus:border-purple-500"
                        />
                        {subtopicFilterText && (
                          <button
                            type="button"
                            onClick={() => setSubtopicFilterText('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}

                    {/* Agrupamento por tópico selecionado */}
                    <div className="max-h-60 overflow-y-auto space-y-3 pr-1">
                      {selectedTopics.map((tp) => {
                        const subs = availableSubtopicsMap[tp] || [];
                        if (!subs || subs.length === 0) return null;

                        const filteredSubs = subtopicFilterText.trim()
                          ? subs.filter((s) => s.toLowerCase().includes(subtopicFilterText.toLowerCase()))
                          : subs;

                        if (filteredSubs.length === 0) return null;

                        return (
                          <div key={tp} className="space-y-1.5">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                              <span>{tp}</span>
                              <span className="text-[10px] text-slate-400 font-normal">({subs.length} temas)</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {filteredSubs.map((sub) => {
                                const isSelected = selectedSubtopics.includes(sub);
                                return (
                                  <button
                                    key={sub}
                                    type="button"
                                    onClick={() => toggleSubtopic(sub)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all text-left flex items-center gap-1.5 ${
                                      isSelected
                                        ? 'bg-purple-600 text-white border-purple-400 shadow-xs'
                                        : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                                    }`}
                                  >
                                    {isSelected && <Check className="w-3 h-3 text-white shrink-0" />}
                                    <span>{sub}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* OBJETIVO 3: ALOCAÇÃO VISUAL E TÁTIL COM STACKED BAR, STEPPERS +/- E CONTADOR VIVO */}
        {distributionMode === 'distribuido' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-4 p-5 rounded-2xl bg-purple-500/5 border border-purple-500/20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-500/20 pb-3">
              <div className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-purple-400 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-purple-200">Alocação das Questões entre Assuntos</h4>
                  <p className="text-[11px] opacity-75">Defina a proporção exata de cada bloco de assunto no simulado</p>
                </div>
              </div>

              {/* CONTADOR VIVO NO TOPO */}
              <div className="flex items-center gap-3 self-end sm:self-auto">
                <div
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                    manualSum === quantity
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 ring-2 ring-emerald-500/20'
                      : manualSum > quantity
                      ? 'bg-red-500/10 border-red-500/40 text-red-300 ring-2 ring-red-500/20'
                      : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                  }`}
                >
                  {manualSum === quantity ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : manualSum > quantity ? (
                    <AlertCircle className="w-4 h-4 text-red-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  )}
                  <span>
                    {manualSum} de {quantity} questões alocadas
                  </span>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-purple-300">
                  <input
                    type="checkbox"
                    checked={isManualDistribution}
                    onChange={(e) => setIsManualDistribution(e.target.checked)}
                    className="w-4 h-4 rounded accent-purple-500"
                  />
                  <span>Manual</span>
                </label>
              </div>
            </div>

            {/* BARRA HORIZONTAL EMPILHADA (STACKED PROPORTIONAL BAR) */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] text-purple-300 font-semibold">
                <span>Distribuição Proporcional do Simulado</span>
                <span>{((manualSum / quantity) * 100).toFixed(0)}% Preenchido</span>
              </div>

              <div className="h-4 w-full rounded-full bg-black/40 border border-white/10 flex overflow-hidden p-0.5 gap-0.5">
                {selectedTopics.map((tp, idx) => {
                  const count = currentAllocation[tp] || 0;
                  if (count <= 0) return null;
                  const pct = (count / quantity) * 100;
                  const colorClass = BAR_COLOR_PALETTE[idx % BAR_COLOR_PALETTE.length];
                  return (
                    <div
                      key={tp}
                      style={{ width: `${pct}%` }}
                      className={`h-full ${colorClass} transition-all duration-300 rounded-sm relative group cursor-pointer`}
                      title={`${tp}: ${count}q. (${pct.toFixed(0)}%)`}
                    />
                  );
                })}
              </div>
            </div>

            {/* LISTA DE ALOCAÇÃO COM STEPPERS +/- TÁTEIS */}
            <div className="space-y-2 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                {selectedTopics.map((tp, idx) => {
                  const spec = topicSpecialtyMap[tp] || selectedSpecialties[0];
                  const count = currentAllocation[tp] || 0;
                  const colorClass = BAR_COLOR_PALETTE[idx % BAR_COLOR_PALETTE.length];

                  return (
                    <div
                      key={tp}
                      className="p-3 rounded-xl bg-black/30 border border-white/10 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className={`w-3 h-3 rounded-full ${colorClass} shrink-0`} />
                        <div className="truncate">
                          <span className="text-[10px] opacity-60 font-mono block text-purple-300">[{spec}]</span>
                          <span className="font-semibold truncate block">{tp}</span>
                        </div>
                      </div>

                      {/* Steppers +/- */}
                      <div className="flex items-center gap-1.5 shrink-0 bg-black/40 p-1 rounded-xl border border-white/10">
                        {isManualDistribution && (
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleManualQuantityChange(tp, -1)}
                            disabled={count <= 0}
                            className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white disabled:opacity-30 transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </motion.button>
                        )}

                        <span className="w-8 text-center font-extrabold text-sm text-purple-200">
                          {count}
                        </span>

                        {isManualDistribution && (
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleManualQuantityChange(tp, 1)}
                            className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </motion.button>
                        )}
                        <span className="text-[10px] opacity-60 pr-1">q.</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {!isManualSumValid && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>
                    A soma das questões alocadas é <strong>{manualSum}</strong>. Ajuste para exatamente <strong>{quantity}</strong> para liberar a geração.
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* CONTEXTO ADICIONAL / TEXTO-FONTE LIVRE (EX: NOTAS DE ESTUDO) */}
        <div className="space-y-2 pt-2 border-t border-white/10">
          <label className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-indigo-400" />
              <span>Contexto Adicional / Texto-Fonte para Geração (Opcional)</span>
            </span>
            {customContext && (
              <button
                type="button"
                onClick={() => setCustomContext('')}
                className="text-[10px] text-rose-400 hover:underline"
              >
                Limpar Texto
              </button>
            )}
          </label>
          <textarea
            id="custom-context-textarea"
            rows={4}
            value={customContext}
            onChange={(e) => setCustomContext(e.target.value)}
            placeholder="Cole aqui um resumo, anotação de estudo, diretriz ou texto médico. A IA priorizará as informações deste texto ao criar os enunciados e condutas das questões."
            className="w-full p-3.5 rounded-2xl bg-black/20 border border-white/10 text-xs font-mono outline-none resize-y transition-all focus:border-indigo-500"
          />
          {customContext.trim().length > 0 && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-xs transition-all">
              <div className="flex flex-col gap-0.5 pr-3">
                <span className="font-semibold text-indigo-300">Restringir estritamente ao texto-fonte</span>
                <span className="text-[11px] text-slate-400">
                  Desativa a base de conhecimento geral/RAG e foca a geração 100% no conteúdo das anotações fornecidas.
                </span>
              </div>
              <input
                type="checkbox"
                checked={strictCustomContextOnly}
                onChange={(e) => setStrictCustomContextOnly(e.target.checked)}
                className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
              />
            </div>
          )}

          {/* PASSO 4: Preview e feedback de cobertura ao usuário */}
          {customContext.trim().length > 0 && detectedCoverageUnits.length > 0 && (
            <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-500/30 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-indigo-300">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <span>Cobertura de Tópicos do Texto-Fonte</span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-semibold">
                  {detectedCoverageUnits.length} {detectedCoverageUnits.length === 1 ? 'tópico detectado' : 'tópicos detectados'}
                </span>
              </div>

              <p className="text-[11px] text-slate-300">
                {quantity >= detectedCoverageUnits.length ? (
                  <>
                    Detectamos <strong>{detectedCoverageUnits.length} tópicos</strong> neste texto — o simulado vai distribuir as <strong>{quantity} questões</strong> proporcionalmente entre eles.
                  </>
                ) : (
                  <>
                    Detectamos <strong>{detectedCoverageUnits.length} tópicos</strong> neste texto — o simulado de <strong>{quantity} questões</strong> priorizará os primeiros {quantity} tópicos. (Para cobrir todos, aumente a quantidade para pelo menos {detectedCoverageUnits.length}).
                  </>
                )}
              </p>

              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {detectedCoverageUnits.map((unit, i) => (
                  <span
                    key={unit.id || i}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-900/40 border border-indigo-400/20 text-[11px] text-indigo-200"
                    title={unit.content}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                    <strong className="font-semibold">{unit.label}</strong>
                    <span className="text-[10px] text-slate-400">({unit.wordCount} palavras)</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quantidade e Dificuldade */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Quantidade Total de Questões ({quantity})
            </label>
            <input
              type="range"
              min={3}
              max={20}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] opacity-60">
              <span>3 q.</span>
              <span>10 q.</span>
              <span>20 q.</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Nível de Dificuldade
            </label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as QuestionDifficulty)}
              className="w-full px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-sm outline-none"
            >
              <option value="facil">Fácil</option>
              <option value="media">Média</option>
              <option value="dificil">Difícil</option>
              <option value="misturar">Misturar Níveis</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Formato de Questão
            </label>
            <select
              value={questionType}
              onChange={(e) => setQuestionType(e.target.value as QuestionType)}
              className="w-full px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-sm outline-none"
            >
              <option value="caso_clinico">Caso Clínico</option>
              <option value="conceitual">Conceitual Puro</option>
              <option value="multipla_escolha">Múltipla Escolha Curta</option>
              <option value="assercao_combinada">Asserção Combinada (Itens I, II, III...)</option>
              <option value="misturar">Misturar Todos</option>
            </select>
          </div>
        </div>

        {/* Toggles section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4 border-t border-white/10 pt-4">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeCommentary}
              onChange={(e) => setIncludeCommentary(e.target.checked)}
              className="w-4 h-4 rounded accent-indigo-500 mt-0.5 shrink-0"
            />
            <span className="text-xs font-semibold leading-snug">Gabarito Comentado (4 Itens)</span>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showReferences}
              onChange={(e) => setShowReferences(e.target.checked)}
              className="w-4 h-4 rounded accent-indigo-500 mt-0.5 shrink-0"
            />
            <span className="text-xs font-semibold leading-snug">Referências Bibliográficas</span>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoGenerateFlashcards}
              onChange={(e) => setAutoGenerateFlashcards(e.target.checked)}
              className="w-4 h-4 rounded accent-indigo-500 mt-0.5 shrink-0"
            />
            <span className="text-xs font-semibold leading-snug">Gerar Flashcards Automaticamente</span>
          </label>

          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={prioritizeLocalQuestions}
              onChange={(e) => setPrioritizeLocalQuestions(e.target.checked)}
              className="w-4 h-4 rounded accent-indigo-500 mt-0.5 shrink-0"
            />
            <span className="text-xs font-semibold leading-snug">Priorizar questões do meu banco (economia máxima)</span>
          </label>
        </div>
      </M3Card>

      <div className="pt-2">
        <M3Button
          variant="filled"
          size="lg"
          onClick={handleGenerate}
          disabled={isGenerating || !isManualSumValid}
          icon={isGenerating ? <Zap className="w-5 h-5 animate-bounce" /> : <Sparkles className="w-5 h-5" />}
          className="w-full py-4 text-base font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg disabled:opacity-50"
        >
          {isGenerating ? 'Recuperando Trechos via RAG & Gerando Questões...' : 'Gerar Simulado de Questões Inéditas Agora'}
        </M3Button>
      </div>

      {/* Confirmation Modal for Low Chunks Warning */}
      {lowChunkWarning && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="max-w-md w-full rounded-3xl p-6 bg-slate-900 border border-amber-500/40 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400 font-bold text-base border-b border-amber-500/20 pb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <span>
                {lowChunkWarning.isGeneralMode || lowChunkWarning.bancaOrProf === 'Base de Conhecimento Geral'
                  ? 'Pouco Material na Base Geral'
                  : 'Pouco Material Desta Origem Encontrado'}
              </span>
            </div>

            {lowChunkWarning.isGeneralMode || lowChunkWarning.bancaOrProf === 'Base de Conhecimento Geral' ? (
              <p className="text-xs opacity-90 leading-relaxed text-slate-300">
                Foram encontrados apenas <strong>{lowChunkWarning.chunkCount} trecho(s)</strong> na base de conhecimento geral sobre o assunto <strong>"{lowChunkWarning.topic}"</strong>.
                <br /><br />
                Para enriquecer a geração de questões com mais conteúdo, você pode importar materiais (livros, artigos, diretrizes, protocolos ou apostilas) pelo <strong>Developer Console</strong>.
              </p>
            ) : (
              <p className="text-xs opacity-90 leading-relaxed text-slate-300">
                Foram encontrados apenas <strong>{lowChunkWarning.chunkCount} trecho(s)</strong> de material de <strong>"{lowChunkWarning.bancaOrProf}"</strong> sobre o assunto <strong>"{lowChunkWarning.topic}"</strong>.
              </p>
            )}

            <p className="text-xs text-amber-300 font-medium">
              Deseja continuar a geração com o material disponível?
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={clearLowChunkWarning}
                className="px-4 py-2.5 text-xs font-semibold rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
              >
                Cancelar
              </button>
              <M3Button
                variant="filled"
                size="sm"
                onClick={async () => {
                  await confirmProceedWithLowChunks();
                  onQuestionsGenerated();
                }}
              >
                Gerar Mesmo Assim
              </M3Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Topic Diversity Capacity Warning */}
      {diversityWarningModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="max-w-lg w-full rounded-3xl p-6 bg-slate-900 border border-amber-500/40 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400 font-bold text-base border-b border-amber-500/20 pb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <span>Material com Conteúdo Concentrado</span>
            </div>

            <div className="text-xs opacity-90 leading-relaxed text-slate-300 space-y-2">
              <p>
                O material fornecido para{' '}
                <strong>"{diversityWarningModal.limitedTopics.map((t) => t.topic).join(', ')}"</strong> sustenta com boa
                qualidade cerca de{' '}
                <strong className="text-emerald-400">
                  {diversityWarningModal.totalCapacity} {diversityWarningModal.totalCapacity === 1 ? 'questão distinta' : 'questões distintas'}
                </strong>{' '}
                — você pediu <strong>{quantity}</strong>.
              </p>
              <p className="text-slate-400">
                Como o texto-fonte é conciso, gerar todas as {quantity} questões pode forçar a IA a criar enunciados
                muito semelhantes ou consumir tokens extras de regeneração.
              </p>
              <p className="text-amber-300 font-medium pt-1">
                Como prefere prosseguir?
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {/* Opção A: Gerar só as com qualidade garantida */}
              <button
                type="button"
                onClick={async () => {
                  const cap = diversityWarningModal.totalCapacity;
                  setQuantity(cap);
                  const updatedReq = {
                    ...diversityWarningModal.request,
                    configuration: {
                      ...diversityWarningModal.request.configuration,
                      quantity: cap,
                      autoCapLimitedQuantity: true,
                    },
                  };
                  setDiversityWarningModal(null);
                  const res = await generateQuestions(updatedReq);
                  if (res) {
                    onQuestionsGenerated();
                  }
                }}
                className="w-full p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-emerald-200 text-left text-xs font-medium transition-colors flex items-start gap-2.5"
              >
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-emerald-300">
                    (Recomendado) Gerar só as ~{diversityWarningModal.totalCapacity} com qualidade garantida
                  </span>
                  <span className="text-[11px] text-emerald-200/80">
                    Ajusta o simulado para {diversityWarningModal.totalCapacity} questões 100% distintas e pedagogicamente ricas.
                  </span>
                </div>
              </button>

              {/* Opção B: Gerar mesmo assim */}
              <button
                type="button"
                onClick={async () => {
                  const updatedReq = {
                    ...diversityWarningModal.request,
                    configuration: {
                      ...diversityWarningModal.request.configuration,
                      forceQuantityDespiteLimit: true,
                    },
                  };
                  setDiversityWarningModal(null);
                  const res = await generateQuestions(updatedReq);
                  if (res) {
                    onQuestionsGenerated();
                  }
                }}
                className="w-full p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 text-left text-xs font-medium transition-colors flex items-start gap-2.5"
              >
                <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-slate-200">
                    Gerar as {quantity} mesmo assim
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Mantém a quantidade solicitada, aceitando eventual similaridade ou custo extra de regeneração.
                  </span>
                </div>
              </button>

              {/* Opção C: Complementar com mais fontes */}
              <button
                type="button"
                onClick={() => {
                  setDiversityWarningModal(null);
                  const el = document.getElementById('custom-context-textarea');
                  if (el) {
                    el.focus();
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}
                className="w-full p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 text-indigo-300 text-left text-xs font-medium transition-colors flex items-start gap-2.5"
              >
                <Plus className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-indigo-200">
                    Complementar com mais fontes
                  </span>
                  <span className="text-[11px] text-indigo-300/80">
                    Volta para o campo de notas para adicionar mais trechos ou diretrizes antes de gerar.
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
