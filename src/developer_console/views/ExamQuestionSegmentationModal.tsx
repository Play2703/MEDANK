/**
 * ExamQuestionSegmentationModal
 *
 * Modal interativo de revisão da segmentação mecânica / OCR de PDFs de provas.
 * Suporta:
 * 1. Camada de texto nativa (100% local determinístico).
 * 2. OCR Local via Tesseract.js / WASM com suporte multiplataforma (Web, iOS/Capacitor, Node).
 * 3. Fallback para OCR Remoto (Gemini) mediante consentimento explícito.
 */

import React, { useState, useEffect, useRef } from 'react';
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
  RefreshCw,
  Cpu,
  Cloud,
  StopCircle,
  Smartphone,
  Sliders,
} from 'lucide-react';
import {
  ExamPDFQuestionSplitter,
  ExtractedExamQuestion,
  ExamSplitterResult,
  SplitterFailureReason,
} from '../../core/exam_bank/services/ExamPDFQuestionSplitter';
import { OCRMode, localOCRService } from '../../core/exam_bank/services/LocalOCRService';
import { RepositoryFactory } from '../../data/repositories_impl/RepositoryFactory';
import { medKnowledgeRepository } from '../../data/repositories_impl/MedKnowledgeRepository';
import { calculateSegmentationStats } from '../../domain/entities/KnowledgeAsset';

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
  const [progressStage, setProgressStage] = useState<string>('Iniciando análise do documento...');
  const [progressPct, setProgressPct] = useState<number>(0);
  const [result, setResult] = useState<ExamSplitterResult | null>(null);
  const [questions, setQuestions] = useState<ExtractedExamQuestion[]>([]);
  const [filterConfidence, setFilterConfidence] = useState<'all' | 'high' | 'low'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [missingPdfWarning, setMissingPdfWarning] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [activeOcrMode, setActiveOcrMode] = useState<OCRMode>('local');
  const [showConsentModal, setShowConsentModal] = useState<boolean>(false);
  const [showRangeOptions, setShowRangeOptions] = useState<boolean>(false);
  const [startPageInput, setStartPageInput] = useState<number>(1);
  const [maxPagesInput, setMaxPagesInput] = useState<number | undefined>(undefined);

  const abortControllerRef = useRef<AbortController | null>(null);
  const consentResolverRef = useRef<((val: boolean) => void) | null>(null);

  const detectedRuntime = localOCRService.runtime;

  useEffect(() => {
    if (isOpen) {
      handleSegment(undefined, 'local');
    } else {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setResult(null);
      setQuestions([]);
      setEditingQuestionId(null);
      setIsSaved(false);
      setMissingPdfWarning(null);
      setAttachedFile(null);
      setProgressPct(0);
      setShowConsentModal(false);
      setShowRangeOptions(false);
    }
  }, [isOpen, rawContent, sourceAssetId]);

  const handleCancelProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
    setProgressStage('Processamento cancelado pelo usuário.');
  };

  const requestRemoteConsent = (): Promise<boolean> => {
    return new Promise((resolve) => {
      consentResolverRef.current = resolve;
      setShowConsentModal(true);
    });
  };

  const handleConsentResponse = (consented: boolean) => {
    setShowConsentModal(false);
    if (consentResolverRef.current) {
      consentResolverRef.current(consented);
      consentResolverRef.current = null;
    }
  };

  const handleSegment = async (
    customFile?: File | Blob,
    requestedOcrMode: OCRMode = 'local',
    pageRange?: { startPage?: number; maxPages?: number }
  ) => {
    setIsProcessing(true);
    setMissingPdfWarning(null);
    setProgressPct(5);
    setProgressStage('Inspecionando estrutura do PDF...');
    setActiveOcrMode(requestedOcrMode);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      let contentToProcess = customFile || attachedFile || rawContent;

      if ((!contentToProcess || typeof contentToProcess === 'string') && sourceAssetId) {
        const storedBlob = await ExamPDFQuestionSplitter.getRawExamPDFBlob(sourceAssetId);
        if (storedBlob) {
          contentToProcess = storedBlob;
        }
      }

      if (!contentToProcess) {
        setMissingPdfWarning(
          'PDF original não disponível — Esta prova foi cadastrada sem o arquivo binário original. Reenvie o arquivo PDF para habilitar a segmentação automática.'
        );
        setIsProcessing(false);
        return;
      }

      const res = await ExamPDFQuestionSplitter.split(contentToProcess as any, {
        ocrMode: requestedOcrMode,
        startPage: pageRange?.startPage || startPageInput,
        maxPages: pageRange?.maxPages || maxPagesInput,
        signal: abortController.signal,
        onProgress: (info) => {
          setProgressStage(info.stage);
          setProgressPct(info.progressPct);
        },
        onConsentRequest: requestRemoteConsent,
      });

      setResult(res);
      setQuestions(res.questions);
    } catch (err: any) {
      if (err?.message?.includes('cancelado')) {
        console.info('[ExamQuestionSegmentationModal] Processamento cancelado.');
      } else {
        console.error('[ExamQuestionSegmentationModal] Erro ao segmentar prova:', err);
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedFile(file);
      handleSegment(file, activeOcrMode);
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
      if (attachedFile && sourceAssetId) {
        await medKnowledgeRepository.saveRawAssetFileBlob(sourceAssetId, attachedFile);
      }

      if (questions.length > 0) {
        const extractedQuestionRepo = RepositoryFactory.getExtractedExamQuestionRepository();

        // Idempotência: limpa extrações antigas deste asset antes de gravar as novas
        if (sourceAssetId) {
          await extractedQuestionRepo.deleteByAssetId(sourceAssetId);
        }

        const records = questions.map((q) => ({
          id: `ext_q_${sourceAssetId || 'adhoc'}_${q.questionNumber}_${Date.now()}`,
          sourceAssetId: sourceAssetId,
          questionNumber: q.questionNumber,
          statement: q.statement,
          options: q.options,
          correctLetter: q.correctLetter,
          specialty: specialty,
          confidence: q.confidence,
          pageNumber: q.pageNumber,
          endPageNumber: q.endPageNumber,
          extractionMethod: q.extractionMethod || result?.extractionMethod || 'native-text',
          ocrConfidence: q.ocrConfidence,
          warning: q.warning,
          createdAt: new Date().toISOString(),
        }));

        await extractedQuestionRepo.bulkSave(records);
      }

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
      console.warn('[ExamQuestionSegmentationModal] Erro ao persistir extractedExamQuestions:', err);
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

  const renderEngineBadge = () => {
    const runtimeLabel =
      detectedRuntime === 'capacitor-ios'
        ? 'iOS Local'
        : detectedRuntime === 'capacitor-android'
        ? 'Android Local'
        : detectedRuntime === 'node'
        ? 'Node Local'
        : 'Web Local';

    if (!result) {
      return (
        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-semibold uppercase bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Analisando ({runtimeLabel})...
        </span>
      );
    }

    if (result.extractionMethod === 'local-ocr') {
      return (
        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1.5 shadow-sm">
          {detectedRuntime === 'capacitor-ios' ? <Smartphone className="w-3 h-3 text-purple-400" /> : <Cpu className="w-3 h-3 text-purple-400" />}
          <span>{runtimeLabel} OCR (0 Tokens)</span>
        </span>
      );
    }

    if (result.extractionMethod === 'remote-ocr') {
      return (
        <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-semibold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
          <Cloud className="w-3 h-3 text-amber-400" />
          OCR Nuvem (Gemini)
        </span>
      );
    }

    return (
      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-semibold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
        <FileText className="w-3 h-3 text-emerald-400" />
        Texto Nativo
      </span>
    );
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
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white truncate">
                  Segmentação Estruturada de Questões
                </h2>
                {renderEngineBadge()}
              </div>
              <p className="text-xs text-slate-400 truncate">
                Documento: <span className="text-slate-200 font-medium">{documentTitle}</span>
                {result?.totalPages ? ` • ${result.totalPages} páginas` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRangeOptions(!showRangeOptions)}
              className={`p-2 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1 ${
                showRangeOptions
                  ? 'bg-indigo-600 text-white border-indigo-500'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="Configurar intervalo de páginas"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Páginas</span>
            </button>

            {result && result.questions.length > 0 && (
              <button
                onClick={handleExportJSON}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors inline-flex items-center gap-1.5 border border-slate-700"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Exportar JSON</span>
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

        {/* Range Selector Panel (Optional) */}
        {showRangeOptions && (
          <div className="px-6 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-4 flex-wrap text-xs text-slate-300">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-semibold text-slate-400">Intervalo de Processamento:</span>
              <div className="flex items-center gap-1.5">
                <span>Da página:</span>
                <input
                  type="number"
                  min={1}
                  value={startPageInput}
                  onChange={(e) => setStartPageInput(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono text-center"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span>Até a página:</span>
                <input
                  type="number"
                  min={startPageInput}
                  placeholder="Fim"
                  value={maxPagesInput || ''}
                  onChange={(e) => setMaxPagesInput(e.target.value ? parseInt(e.target.value) : undefined)}
                  className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono text-center"
                />
              </div>
            </div>

            <button
              onClick={() => handleSegment(undefined, activeOcrMode, { startPage: startPageInput, maxPages: maxPagesInput })}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reprocessar Intervalo</span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isProcessing ? (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <RefreshCw className="w-7 h-7 animate-spin" />
              </div>
              <div className="space-y-1 w-full">
                <h4 className="text-base font-bold text-white">Processando Documento...</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {progressStage}
                </p>
                <div className="w-full bg-slate-800 h-2.5 rounded-full mt-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[11px] font-mono text-slate-500 mt-1">
                  <span>Zero Tokens (100% Local)</span>
                  <span>{progressPct}%</span>
                </div>
              </div>
              <button
                onClick={handleCancelProcessing}
                className="mt-2 px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <StopCircle className="w-4 h-4" />
                <span>Cancelar Processamento</span>
              </button>
            </div>
          ) : missingPdfWarning ? (
            <div className="py-16 text-center space-y-4 max-w-md mx-auto">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div className="space-y-2">
                <h4 className="text-base font-bold text-white">PDF original não disponível</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {missingPdfWarning}
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
            <div className="py-16 text-center space-y-5 max-w-lg mx-auto">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div className="space-y-2">
                <h4 className="text-base font-bold text-white">
                  {result?.inspection?.isScannedPdf
                    ? 'PDF Escaneado (Imagens) Detectado'
                    : 'Nenhuma questão estruturada encontrada'}
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {result?.warning ||
                    'Este arquivo não possui marcadores numéricos convencionais na camada de texto. O documento continua utilizável para estudo e RAG como texto corrido.'}
                </p>
                {result?.inspection && (
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400 flex justify-around">
                    <span>Páginas: <strong>{result.inspection.totalPages}</strong></span>
                    <span>Páginas Vazias: <strong>{result.inspection.emptyPagesCount} ({Math.round(result.inspection.emptyPagesRatio * 100)}%)</strong></span>
                    <span>Modo: <strong>{result.inspection.isScannedPdf ? 'Escaneado/Imagem' : 'Texto Vetorial'}</strong></span>
                  </div>
                )}
              </div>

              {/* Botões de Ação para OCR */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => handleSegment(undefined, 'local')}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md shadow-purple-900/30 flex items-center justify-center gap-2 transition-all"
                >
                  <Cpu className="w-4 h-4" />
                  <span>Executar OCR Local (100% Local / 0 Tokens)</span>
                </button>

                <button
                  onClick={() => handleSegment(undefined, 'remote-consent')}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 flex items-center justify-center gap-2 transition-colors"
                >
                  <Cloud className="w-4 h-4 text-amber-400" />
                  <span>Tentar OCR na Nuvem (Gemini)</span>
                </button>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 leading-relaxed text-left">
                💡 <strong>Garantia de Privacidade & Custo:</strong> O OCR Local roda inteiramente no processador do seu aparelho ({detectedRuntime === 'capacitor-ios' ? 'iPhone/iPad' : 'computador/navegador'}). Seus arquivos nunca saem do dispositivo e não há consumo de cotas de IA.
              </div>

              <div className="pt-2">
                <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs transition-colors border border-slate-800">
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
                    <strong className="font-bold">Aviso de Qualidade: </strong>
                    {result.warning} Você pode revisar ou editar os enunciados e alternativas diretamente antes de confirmar.
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
                            {q.endPageNumber && q.endPageNumber !== q.pageNumber
                              ? `Págs. ${q.pageNumber}-${q.endPageNumber}`
                              : `Pág. ${q.pageNumber}`}
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

      {/* Explicit Consent Dialog for Remote OCR */}
      <AnimatePresence>
        {showConsentModal && (
          <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-amber-500/40 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 text-slate-100"
            >
              <div className="flex items-center gap-3 text-amber-400 font-bold text-base border-b border-amber-500/20 pb-3">
                <Cloud className="w-6 h-6 shrink-0" />
                <span>Autorização para OCR Remoto na Nuvem</span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                O <strong>OCR Remoto</strong> envia imagens das páginas da prova para processamento visual na API do Google Gemini.
                <br /><br />
                Esta operação pode consumir <strong>créditos ou tokens de IA</strong> da sua cota da API.
              </p>

              <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-xs text-amber-200">
                💡 O MEDANK prioriza OCR 100% local por padrão para não gastar tokens. Use esta opção se o documento tiver caligrafia ou imagens complexas.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => handleConsentResponse(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleConsentResponse(true)}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md shadow-amber-900/30 transition-all"
                >
                  Autorizar & Processar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
