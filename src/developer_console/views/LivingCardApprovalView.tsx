import React, { useState, useEffect } from 'react';
import { db } from '../../data/db/database';
import { livingCardEngine, BatchProcessResult } from '../../data/services/LivingCardEngine';
import { CardPendingSuggestionRecord } from '../../domain/entities/LivingCard';
import { FlashCard } from '../../domain/entities/Card';
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Layers,
  AlertTriangle,
  ArrowRight,
  HelpCircle,
  Flame,
  FileCode,
  Zap,
} from 'lucide-react';

export const LivingCardApprovalView: React.FC = () => {
  const [pendingSuggestions, setPendingSuggestions] = useState<CardPendingSuggestionRecord[]>([]);
  const [parentCardsMap, setParentCardsMap] = useState<Record<string, FlashCard>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [isProcessingBatch, setIsProcessingBatch] = useState<boolean>(false);
  const [batchResult, setBatchResult] = useState<BatchProcessResult | null>(null);

  const loadPendingSuggestions = async () => {
    setLoading(true);
    try {
      const sugs = await db.cardPendingSuggestions.where('status').equals('pending').toArray();
      setPendingSuggestions(sugs);

      const cardIds = Array.from(new Set(sugs.map((s) => s.cardId)));
      const cards = cardIds.length > 0 ? await db.flashcards.bulkGet(cardIds) : [];

      const map: Record<string, FlashCard> = {};
      for (const c of cards) {
        if (c) map[c.id] = c;
      }
      setParentCardsMap(map);
    } catch (err) {
      console.error('[LivingCardApprovalView] Error loading pending suggestions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPendingSuggestions();
  }, []);

  const handleRunBatchNow = async () => {
    setIsProcessingBatch(true);
    setBatchResult(null);
    try {
      const res = await livingCardEngine.processAccumulatedSignals(true);
      setBatchResult(res);
      await loadPendingSuggestions();
    } catch (err) {
      console.error('[LivingCardApprovalView] Error running batch:', err);
    } finally {
      setIsProcessingBatch(false);
    }
  };

  const handleApprove = async (suggestionId: string) => {
    try {
      await livingCardEngine.approveSuggestion(suggestionId);
      await loadPendingSuggestions();
    } catch (err) {
      console.error('[LivingCardApprovalView] Failed to approve suggestion:', err);
    }
  };

  const handleReject = async (suggestionId: string) => {
    try {
      await livingCardEngine.rejectSuggestion(suggestionId);
      await loadPendingSuggestions();
    } catch (err) {
      console.error('[LivingCardApprovalView] Failed to reject suggestion:', err);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl font-bold text-emerald-400">🌱 Fila de Aprovação de Flashcards Vivos</span>
            <span className="text-[10px] font-mono uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
              REGRA A: Revisão Humana Obrigatória
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Nenhum fato clínico novo é mutado automaticamente no card-pai. Aprovações criam novos cards-filhos atômicos com estado SM-2 do zero.
          </p>
        </div>

        <button
          onClick={handleRunBatchNow}
          disabled={isProcessingBatch}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg disabled:opacity-50 transition-all shrink-0 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isProcessingBatch ? 'animate-spin' : ''}`} />
          <span>{isProcessingBatch ? 'Processando Sinais...' : 'Processar Sinais Acumulados Agora'}</span>
        </button>
      </div>

      {/* Batch Run Result Telemetry */}
      {batchResult && (
        <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs space-y-1 text-indigo-300">
          <div className="font-bold flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Resultado do Processamento em Lote:</span>
          </div>
          <p>
            • Cards analisados: <strong>{batchResult.processedCardCount}</strong> | Sugestões criadas: <strong>{batchResult.suggestionsCreatedCount}</strong> | Safe Links: <strong>{batchResult.safeLinksCount}</strong> | Tokens gastos: <strong>{batchResult.totalTokensUsed}</strong> ({batchResult.modelUsed})
          </p>
        </div>
      )}

      {/* Pending Suggestions List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-xs font-semibold">
          Carregando fila de aprovação...
        </div>
      ) : pendingSuggestions.length === 0 ? (
        <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto opacity-80" />
          <h4 className="text-sm font-bold text-slate-200">Fila de Aprovação Limpa</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Não há nenhuma sugestão clínica pendente no momento. Os sinais continuam acumulando localmente conforme você estuda ou importa documentos.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
            Sugestões Pendentes ({pendingSuggestions.length})
          </h4>

          {pendingSuggestions.map((sug) => {
            const parent = parentCardsMap[sug.cardId];
            return (
              <div
                key={sug.id}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 shadow-lg"
              >
                {/* Header info */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {sug.suggestionType === 'new_child_card' ? 'Novo Card-Filho' : 'Expansão Clínica'}
                    </span>
                    <span className="text-xs opacity-70">
                      Criado em {new Date(sug.createdAt).toLocaleString('pt-BR')}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-slate-400">
                    Sinais de origem: {sug.sourceSignalIds.length}
                  </span>
                </div>

                {/* Original Card vs Proposed Child Card Diff */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Left: Original Card (Pai) */}
                  <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Card Original (SM-2 Preservado)
                    </span>
                    <div>
                      <strong className="text-slate-300 block mb-0.5">Frente:</strong>
                      <p className="text-slate-200">{parent?.front || sug.cardId}</p>
                    </div>
                    <div>
                      <strong className="text-slate-300 block mb-0.5">Verso:</strong>
                      <p className="text-slate-200">{parent?.back || 'N/A'}</p>
                    </div>
                  </div>

                  {/* Right: Proposed Child Card */}
                  <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                      Proposta de Novo Card-Filho (Atômico)
                    </span>
                    <div>
                      <strong className="text-emerald-300 block mb-0.5">Frente Sugerida:</strong>
                      <p className="text-emerald-100 font-semibold">{sug.proposedContent.newChildFront}</p>
                    </div>
                    <div>
                      <strong className="text-emerald-300 block mb-0.5">Verso Sugerido:</strong>
                      <p className="text-emerald-100">{sug.proposedContent.newChildBack || sug.proposedContent.proposedValue}</p>
                    </div>
                  </div>
                </div>

                {/* Reasoning */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                  <span className="font-bold text-amber-400 block">Motivo da IA (Sinais Detectados):</span>
                  <p className="text-slate-300 opacity-90">{sug.proposedContent.reasoning}</p>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => handleReject(sug.id)}
                    className="px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-bold text-xs flex items-center gap-1.5 border border-rose-500/30 transition-all cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Rejeitar</span>
                  </button>

                  <button
                    onClick={() => handleApprove(sug.id)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Aprovar e Criar Card-Filho</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
