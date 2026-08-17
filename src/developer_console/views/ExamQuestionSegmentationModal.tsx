/**
 * ExamQuestionSegmentationModal
 *
 * Modal interativo de revisão da segmentação automática mecânica (sem IA) de PDFs de provas.
 * Permite ao usuário inspecionar cada questão, enunciado, alternativas A-E, gabarito e
 * nível de confiança antes de confirmar a gravação.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Search,
  Check,
  Edit3,
  Download,
  HelpCircle,
  Layers,
  Save,
  Clock,
  ShieldAlert,
  ArrowRight,
  Upload,
} from 'lucide-react';
import {
  ExamPDFQuestionSplitter,
  ExtractedExamQuestion,
  ExamSplitterResult,
} from '../../core/exam_bank/services/ExamPDFQuestionSplitter';
import { RepositoryFactory } from '../../data/repositories_impl/RepositoryFactory';
import { medKnowledgeRepository } from '../../data/repositories_impl/MedKnowledgeRepository';
import { calculateSegmentationStats } from '../../domain/entities/KnowledgeAsset';
import { db } from '../../data/db/database';

interface ExamQuestionSegmentationModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  sourceAssetId?: string;
  specialty?: string;
  rawContent: string | ArrayBuffer | Uint8Array | File | Blob | null;
  onSaveQuestions?: (questions: ExtractedExamQuestion[]) => void;
}

export const ExamQuestionSegmentationModal: React.FC<ExamQuestionSegmentationModalProps> = ({
  isOpen,
  onClose,
  documentTitle,
  sourceAssetId,
  specialty,
  rawContent,
  onSaveQuestions,
}) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [result, setResult] = useState<ExamSplitterResult | null>(null);
  const [questions, setQuestions] = useState<ExtractedExamQuestion[]>([]);
  const [filterConfidence, setFilterConfidence] = useState<'all' | 'high' | 'low'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [missingPdfWarning, setMissingPdfWarning] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);

  useEffect(() => {
    if (isOpen) {
      handleSegment();
    } else {
      setResult(null);
      setQuestions([]);
      setEditingQuestionId(null);
      setIsSaved(false);
      setMissingPdfWarning(null);
      setAttachedFile(null);
    }
  }, [isOpen, rawContent, sourceAssetId]);

  const handleSegment = async (customFile?: File | Blob) => {
    setIsProcessing(true);
    setMissingPdfWarning(null);
    try {
      let contentToProcess = customFile || attachedFile || rawContent;

      // Se não for um Blob/File direto e tivermos o ID do asset, busca na tabela knowledgeAssetFiles
      if ((!contentToProcess || typeof contentToProcess === 'string') && sourceAssetId) {
        const storedBlob = await ExamPDFQuestionSplitter.getRawExamPDFBlob(sourceAssetId);
        if (storedBlob) {
          contentToProcess = storedBlob;
        }
      }

      if (!contentToProcess) {
        setMissingPdfWarning(
          'PDF original não disponível — Esta prova foi cadastrada sem o arquivo binário original. Reenvie o arquivo PDF para habilitar a segmentação automática por coordenadas de layout.'
        );
        setIsProcessing(false);
        return;
      }

      // 100% Determinístico localmente, sem IA
      const res = await ExamPDFQuestionSplitter.split(contentToProcess as any);
      setResult(res);
      setQuestions(res.questions);
    } catch (err) {
      console.error('[ExamQuestionSegmentationModal] Erro ao segmentar prova:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedFile(file);
      handleSegment(file);
    }
  };

  if (!isOpen) return null;

  const filteredQuestions = questions.filter((q) => {
    const matchesConfidence =
      filterConfidence === 'all' || q.confidence === filterConfidence;
    const matchesSearch =
      !searchTerm ||
      q.statement.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.options.some((o) => o.text.toLowerCase().includes(searchTerm.toLowerCase())) ||
      `questão ${q.questionNumber}`.includes(searchTerm.toLowerCase()) ||
      `q${q.questionNumber}`.includes(searchTerm.toLowerCase());

    return matchesConfidence && matchesSearch;
  });

  const handleUpdateStatement = (qNum: number, newStatement: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.questionNumber === qNum ? { ...q, statement: newStatement } : q
      )
    );
  };

  const handleUpdateOption = (qNum: number, optIdx: number, newText: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.questionNumber === qNum) {
          const newOpts = [...q.options];
          newOpts[optIdx] = { ...newOpts[optIdx], text: newText };
          return { ...q, options: newOpts };
        }
        return q;
      })
    );
  };

  const handleUpdateCorrectLetter = (qNum: number, letter: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.questionNumber === qNum ? { ...q, correctLetter: letter } : q
      )
    );
  };

  const handleSave = async () => {
    try {
      // 1. Se um novo arquivo binário foi selecionado, armazena no repositório de arquivos
      if (attachedFile && sourceAssetId) {
        await medKnowledgeRepository.saveRawAssetFileBlob(sourceAssetId, attachedFile);
      }

      // 2. Persiste as questões extraídas através da camada resolvida por RepositoryFactory
      if (questions.length > 0) {
        const records = questions.map((q) => ({
          id: `ext_q_${Date.now()}_${q.questionNumber}_${Math.random().toString(36).substring(2, 7)}`,
          sourceAssetId: sourceAssetId,
          questionNumber: q.questionNumber,
          statement: q.statement,
          options: q.options,
          correctLetter: q.correctLetter,
          specialty: specialty,
          confidence: q.confidence,
          createdAt: new Date().toISOString(),
        }));

        const extractedQuestionRepo = RepositoryFactory.getExtractedExamQuestionRepository();
        await extractedQuestionRepo.bulkSave(records);
      }

      // 3. Calcula e persiste as estatísticas agregadas de segmentação no KnowledgeAsset de origem
      if (sourceAssetId && questions.length > 0) {
        const highCount = questions.filter((q) => q.confidence === 'high').length;
        const lowCount = questions.filter((q) => q.confidence === 'low').length;
        const stats = calculateSegmentationStats(questions.length, highCount, lowCount);

        const asset = await medKnowledgeRepository.getAssetById(sourceAssetId);
        if (asset) {
          asset.metadata = {
            ...(asset.metadata || {}),
            examSegmentationStats: stats,
          };
          if (attachedFile) {
            asset.file.hasRawFileBlob = true;
            asset.file.rawFileStorageKey = sourceAssetId;
          }
          await medKnowledgeRepository.saveAsset(asset);
        }
      }
    } catch (err) {
      console.warn('[ExamQuestionSegmentationModal] Erro ao persistir extractedExamQuestions / knowledgeAssetFiles / examSegmentationStats:', err);
    }

    if (onSaveQuestions) {
      onSaveQuestions(questions);
    }
    setIsSaved(true);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(questions, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${documentTitle || 'prova'}_questoes_segmentadas.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-5xl w-full h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0 bg-slate-950/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white truncate">
                  Segmentação Mecânica de Questões
                </h2>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Motor Local (Sem IA)
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                Documento: <span className="text-slate-200 font-medium">{documentTitle}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {result && result.questions.length > 0 && (
              <button
                onClick={handleExportJSON}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors inline-flex items-center gap-1.5 border border-slate-700"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>Exportar JSON</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isProcessing ? (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 animate-spin">
                <Clock className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-white">Segmentando layout do PDF...</h4>
                <p className="text-xs text-slate-400 max-w-sm">
                  Agrupando blocos geométricos, identificando enunciados, alternativas A-E e tabela de gabarito.
                </p>
              </div>
            </div>
          ) : missingPdfWarning ? (
            <div className="py-16 text-center space-y-4 max-w-md mx-auto">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div className="space-y-2">
                <h4 className="text-base font-bold text-white">PDF original não disponível</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Esta prova foi cadastrada anteriormente sem o arquivo PDF binário original. Para habilitar a segmentação mecânica de alta precisão por coordenadas de layout, selecione o arquivo PDF abaixo:
                </p>
              </div>
              <div>
                <label className="cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-900/30 transition-all hover:scale-105 active:scale-95">
                  <Upload className="w-4 h-4" />
                  <span>Selecionar Arquivo PDF da Prova</span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
            </div>
          ) : !result || result.totalQuestions === 0 ? (
            <div className="py-16 text-center space-y-4 max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-white">Nenhuma questão estruturada encontrada</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Este arquivo não possui marcadores numéricos convencionais (ex: "QUESTÃO 1", "1. Enunciado", "A) Alternativa"). O documento continua utilizável para estudo e RAG como texto corrido.
                </p>
              </div>
              <div>
                <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Testar outro arquivo PDF</span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
            </div>
          ) : (
            <>
              {/* Metrics & Quality Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                  <span className="text-[11px] font-semibold text-slate-400">Total de Questões</span>
                  <div className="text-2xl font-bold text-white tracking-tight">{result.totalQuestions}</div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                  <span className="text-[11px] font-semibold text-slate-400">Alta Confiança</span>
                  <div className="text-2xl font-bold text-emerald-400 tracking-tight flex items-center gap-1.5">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>{result.highConfidenceCount}</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                  <span className="text-[11px] font-semibold text-slate-400">Baixa Confiança</span>
                  <div className={`text-2xl font-bold tracking-tight flex items-center gap-1.5 ${result.lowConfidenceCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                    <AlertTriangle className="w-5 h-5" />
                    <span>{result.lowConfidenceCount}</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                  <span className="text-[11px] font-semibold text-slate-400">Gabarito Mapeado</span>
                  <div className="text-2xl font-bold text-indigo-400 tracking-tight">
                    {result.answerKeyFound ? 'Sim (Oficial)' : 'Parcial'}
                  </div>
                </div>
              </div>

              {/* Quality Warning if >40% low confidence */}
              {result.warning && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-start gap-3 text-xs leading-relaxed">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">Aviso de Qualidade de Layout: </strong>
                    {result.warning} Você pode revisar ou editar as alternativas diretamente antes de confirmar.
                  </div>
                </div>
              )}

              {/* Filters Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filtrar questão ou termo..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 self-end sm:self-auto">
                  <button
                    onClick={() => setFilterConfidence('all')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      filterConfidence === 'all'
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Todas ({questions.length})
                  </button>
                  <button
                    onClick={() => setFilterConfidence('high')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      filterConfidence === 'high'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'text-slate-400 hover:text-emerald-300'
                    }`}
                  >
                    Alta ({result.highConfidenceCount})
                  </button>
                  <button
                    onClick={() => setFilterConfidence('low')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      filterConfidence === 'low'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'text-slate-400 hover:text-amber-300'
                    }`}
                  >
                    Baixa ({result.lowConfidenceCount})
                  </button>
                </div>
              </div>

              {/* Questions List */}
              <div className="space-y-4">
                {filteredQuestions.map((q) => {
                  const isEditing = editingQuestionId === q.questionNumber;

                  return (
                    <div
                      key={q.questionNumber}
                      className={`p-5 rounded-2xl bg-slate-950/70 border transition-all space-y-4 ${
                        q.confidence === 'high'
                          ? 'border-slate-800 hover:border-slate-700'
                          : 'border-amber-500/30 bg-amber-500/[0.02]'
                      }`}
                    >
                      {/* Question Top Row */}
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2.5">
                          <span className="px-2.5 py-1 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-xs font-mono font-bold text-indigo-300">
                            Questão {q.questionNumber}
                          </span>

                          {q.confidence === 'high' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-lg border border-emerald-500/20">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Alta Confiança
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-500/20" title={q.warning}>
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {q.warning || 'Baixa Confiança'}
                            </span>
                          )}

                          <span className="text-xs text-slate-500 font-mono">
                            Pág. {q.pageNumber}
                          </span>
                        </div>

                        {/* Gabarito Selector */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-400">Gabarito:</span>
                          <div className="flex items-center gap-1">
                            {['A', 'B', 'C', 'D', 'E'].map((letter) => (
                              <button
                                key={letter}
                                onClick={() => handleUpdateCorrectLetter(q.questionNumber, letter)}
                                className={`w-7 h-7 rounded-lg text-xs font-bold font-mono transition-all ${
                                  q.correctLetter === letter
                                    ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/30'
                                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                                }`}
                              >
                                {letter}
                              </button>
                            ))}
                          </div>

                          <button
                            onClick={() => setEditingQuestionId(isEditing ? null : q.questionNumber)}
                            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors ml-2"
                            title="Editar Enunciado"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Statement */}
                      {isEditing ? (
                        <textarea
                          rows={3}
                          value={q.statement}
                          onChange={(e) => handleUpdateStatement(q.questionNumber, e.target.value)}
                          className="w-full bg-slate-900 border border-indigo-500/50 rounded-xl p-3 text-xs text-slate-200 leading-relaxed focus:outline-none"
                        />
                      ) : (
                        <p className="text-xs text-slate-200 leading-relaxed">
                          {q.statement}
                        </p>
                      )}

                      {/* Options List */}
                      <div className="space-y-2 pt-1">
                        {q.options.map((opt, optIdx) => {
                          const isCorrect = q.correctLetter === opt.letter;

                          return (
                            <div
                              key={opt.letter}
                              className={`p-3 rounded-xl border flex items-start gap-3 text-xs transition-all ${
                                isCorrect
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                                  : 'bg-slate-900/60 border-slate-800 text-slate-300'
                              }`}
                            >
                              <button
                                onClick={() => handleUpdateCorrectLetter(q.questionNumber, opt.letter)}
                                className={`w-5 h-5 rounded-md font-mono font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                                  isCorrect
                                    ? 'bg-emerald-500 text-slate-950'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {opt.letter}
                              </button>

                              {isEditing ? (
                                <input
                                  type="text"
                                  value={opt.text}
                                  onChange={(e) => handleUpdateOption(q.questionNumber, optIdx, e.target.value)}
                                  className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none"
                                />
                              ) : (
                                <span className="flex-1 leading-relaxed">{opt.text}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-slate-800 flex items-center justify-between gap-4 shrink-0 bg-slate-950/60">
          <span className="text-xs text-slate-400 font-mono">
            {questions.length} questões prontas para estruturação
          </span>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
            >
              Cancelar
            </button>

            <button
              onClick={handleSave}
              disabled={questions.length === 0 || isSaved}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                isSaved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30'
              }`}
            >
              {isSaved ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Salvo com Sucesso!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Confirmar & Salvar Questões</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
