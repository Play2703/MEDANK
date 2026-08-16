import React, { useState, useEffect } from 'react';
import { apiUrl } from '../../lib/apiBaseUrl';
import {
  Database,
  Activity,
  Share2,
  Clock,
  HardDrive,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Sparkles,
  Tag,
  Network,
} from 'lucide-react';

export interface DictionaryHealthData {
  success: boolean;
  totalTerms: number;
  termsBySystem: Array<{ system: string; count: number }>;
  graphNodes: number;
  graphEdges: number;
  topPredicates: Array<{ predicate: string; count: number }>;
  lastUpdated: string | null;
  dbSizeBytes: number;
  error?: string;
}

export const DictionaryHealthAdminView: React.FC = () => {
  const [data, setData] = useState<DictionaryHealthData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/dictionary-health'));
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}: Falha ao consultar saúde do dicionário`);
      }
      const json: DictionaryHealthData = await res.json();
      if (!json.success && json.error) {
        throw new Error(json.error);
      }
      setData(json);
      setLastRefreshed(new Date());
    } catch (err: any) {
      console.error('[DictionaryHealthAdminView] Erro ao carregar métricas:', err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const formatRelativeTime = (isoString: string | null) => {
    if (!isoString) return 'Desconhecido';
    try {
      const date = new Date(isoString);
      const diffMs = Date.now() - date.getTime();
      const diffMin = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMin < 1) return 'Agora mesmo';
      if (diffMin < 60) return `há ${diffMin} min`;
      if (diffHours < 24) return `há ${diffHours}h ${diffMin % 60}m`;
      if (diffDays === 1) return 'há 1 dia';
      return `há ${diffDays} dias`;
    } catch {
      return isoString;
    }
  };

  const formatFullDate = (isoString: string | null) => {
    if (!isoString) return '—';
    try {
      return new Date(isoString).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const formatMb = (bytes: number) => {
    if (!bytes) return '0.00 MB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const isHealthy = Boolean(data && data.totalTerms > 0 && !error);
  const isCritical = Boolean(error || (data && data.totalTerms === 0));

  return (
    <div className="space-y-6">
      {/* Header with Title and Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Saúde do Dicionário Terminológico</span>
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-semibold">
                SQLite • better-sqlite3
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Integridade dos vocabulários clínicos DeCS/CID-10 e do Grafo de Conhecimento em runtime.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-[11px] text-slate-400 font-mono hidden md:inline">
            Atualizado às {lastRefreshed.toLocaleTimeString('pt-BR')}
          </span>
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-teal-400 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Atualizando...' : 'Atualizar Métricas'}</span>
          </button>
        </div>
      </div>

      {/* Critical Alert Banner if empty or error */}
      {isCritical && (
        <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-200 space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm text-rose-300">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>⚠️ Dicionário vazio ou inacessível — rode os scripts de importação DeCS/CID-10</span>
          </div>
          <p className="text-xs text-rose-300/80 pl-7 leading-relaxed">
            {error || 'Nenhum termo médico foi indexado no banco SQLite (totalTerms = 0). O motor NER não conseguirá reconhecer entidades médicas até que o banco seja povoado.'}
          </p>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Terms */}
        <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between gap-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total de Termos</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white tracking-tight">
              {loading ? '—' : (data?.totalTerms ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-emerald-400 mt-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Vocabulário Clínico Indexado</span>
            </div>
          </div>
        </div>

        {/* Card 2: Knowledge Graph Nodes */}
        <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between gap-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Nós do Grafo</span>
            <div className="w-8 h-8 rounded-xl bg-teal-500/15 text-teal-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white tracking-tight">
              {loading ? '—' : (data?.graphNodes ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-1">
              <Network className="w-3.5 h-3.5 text-teal-400" />
              <span>Entidades Canônicas Conectadas</span>
            </div>
          </div>
        </div>

        {/* Card 3: Knowledge Graph Edges */}
        <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between gap-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Arestas do Grafo</span>
            <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
              <Share2 className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white tracking-tight">
              {loading ? '—' : (data?.graphEdges ?? 0).toLocaleString('pt-BR')}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Relações Semânticas Extraídas</span>
            </div>
          </div>
        </div>

        {/* Card 4: DB Size & Timestamp */}
        <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between gap-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Tamanho & Atualização</span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white tracking-tight">
              {loading ? '—' : formatMb(data?.dbSizeBytes ?? 0)}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-1" title={formatFullDate(data?.lastUpdated ?? null)}>
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Modificado {formatRelativeTime(data?.lastUpdated ?? null)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Two-column Detail Section: Breakdown by System & Top Predicates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Breakdown by Vocabulary System */}
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Tag className="w-4 h-4 text-indigo-400" />
              <span>Distribuição por Sistema Terminológico</span>
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">
              {(data?.termsBySystem?.length ?? 0)} sistemas
            </span>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="py-8 text-center text-xs text-slate-500">Carregando distribuição...</div>
            ) : !data?.termsBySystem || data.termsBySystem.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">Nenhum termo catalogado por sistema.</div>
            ) : (
              data.termsBySystem.map((item, idx) => {
                const total = data.totalTerms || 1;
                const pct = Math.max(Math.round((item.count / total) * 100), item.count > 0 ? 1 : 0);
                const sysUpper = item.system.toUpperCase();
                const isDeCS = sysUpper.includes('DECS');
                const isCID = sysUpper.includes('CID');
                const isRename = sysUpper.includes('RENAME');
                const isTuss = sysUpper.includes('TUSS');

                const dotColor = isDeCS
                  ? 'bg-indigo-400'
                  : isCID
                  ? 'bg-emerald-400'
                  : isRename
                  ? 'bg-amber-400'
                  : isTuss
                  ? 'bg-cyan-400'
                  : 'bg-slate-400';

                const barColor = isDeCS
                  ? 'bg-indigo-500'
                  : isCID
                  ? 'bg-emerald-500'
                  : isRename
                  ? 'bg-amber-500'
                  : isTuss
                  ? 'bg-cyan-500'
                  : 'bg-slate-400';

                return (
                  <div key={idx} className="p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                        <span className="font-semibold text-xs text-slate-200">{item.system}</span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-xs">
                        <span className="text-white font-bold">{item.count.toLocaleString('pt-BR')} termos</span>
                        <span className="text-slate-500">({pct}%)</span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-1.5 rounded-full bg-slate-700/60 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Top 10 Predicates / Relations in Knowledge Graph */}
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Share2 className="w-4 h-4 text-purple-400" />
              <span>Predicados mais Frequentes no Grafo (Top 10)</span>
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">
              {(data?.topPredicates?.length ?? 0)} tipos
            </span>
          </div>

          <div className="space-y-2">
            {loading ? (
              <div className="py-8 text-center text-xs text-slate-500">Carregando predicados...</div>
            ) : !data?.topPredicates || data.topPredicates.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">Nenhum predicado registrado no grafo.</div>
            ) : (
              data.topPredicates.map((item, idx) => {
                const totalEdges = data.graphEdges || 1;
                const pct = Math.round((item.count / totalEdges) * 100);

                return (
                  <div
                    key={idx}
                    className="p-2.5 px-3.5 rounded-xl bg-slate-800/40 border border-slate-700/40 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-[10px] text-slate-500 w-4">#{idx + 1}</span>
                      <span className="font-mono font-bold text-purple-300">{item.predicate}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-white font-semibold">{item.count.toLocaleString('pt-BR')}</span>
                      <span className="text-slate-500 text-[10px]">({pct}%)</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Storage & Metadata Technical Info */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400 font-mono">
        <div>
          <span>Arquivo SQLite: </span>
          <span className="text-slate-200">src/core/ner/medicalTerminology.db</span>
        </div>
        <div>
          <span>Última modificação no disco: </span>
          <span className="text-slate-200">{formatFullDate(data?.lastUpdated ?? null)}</span>
        </div>
      </div>
    </div>
  );
};
