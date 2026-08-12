import React from 'react';
import { useStatsViewModel } from '../../viewmodels/useStatsViewModel';
import { useDevice } from '../../../core/responsive/DeviceContext';
import { M3Card } from '../../components/Material3/M3Card';
import {
  Flame,
  Target,
  Clock,
  Calendar,
  Award,
  TrendingUp,
  BrainCircuit,
  Loader2,
} from 'lucide-react';

export const StatsView: React.FC = () => {
  const { colors } = useDevice();
  const { stats, loading } = useStatsViewModel();

  if (loading || !stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-600" />
        <p className="text-sm opacity-80">Carregando métricas de aprendizagem...</p>
      </div>
    );
  }

  // Generate last 60 days for heatmap visual
  const today = new Date();
  const daysGrid = Array.from({ length: 60 }).map((_, idx) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (59 - idx));
    const dateKey = d.toISOString().split('T')[0];
    const count = stats.heatmapData[dateKey] || 0;
    return { dateKey, count };
  });

  const mastery = stats.contentMastery ?? 0;
  let masteryLabel = 'Precisa Melhorar';
  if (mastery >= 80) masteryLabel = 'Excelente';
  else if (mastery >= 60) masteryLabel = 'Bom';
  else if (mastery >= 40) masteryLabel = 'Regular';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-6">
      {/* Title */}
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Estatísticas & Performance Anki</h2>
        <p className="text-sm opacity-80">
          Acompanhamento analítico da sua curva de esquecimento e retenção médica.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <M3Card variant="filled" className="p-3 sm:p-4 flex flex-col justify-between space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between opacity-80 text-[11px] sm:text-xs font-bold">
            <span className="truncate">Ofensiva Atual</span>
            <Flame className="w-4 h-4 text-amber-500 shrink-0" />
          </div>
          <div className="text-xl sm:text-3xl font-black text-amber-500 truncate">{stats.dailyStreak} dias</div>
          <div className="text-[10px] opacity-70 truncate">Sequência ininterrupta</div>
        </M3Card>

        <M3Card variant="filled" className="p-3 sm:p-4 flex flex-col justify-between space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between opacity-80 text-[11px] sm:text-xs font-bold">
            <span className="truncate">Taxa de Retenção</span>
            <Target className="w-4 h-4 text-emerald-500 shrink-0" />
          </div>
          <div className="text-xl sm:text-3xl font-black text-emerald-500 truncate">{stats.retentionRate}%</div>
          <div className="text-[10px] opacity-70 truncate">Aprovado no SM-2</div>
        </M3Card>

        <M3Card variant="filled" className="p-3 sm:p-4 flex flex-col justify-between space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between opacity-80 text-[11px] sm:text-xs font-bold">
            <span className="truncate">Revisões Hoje</span>
            <TrendingUp className="w-4 h-4 text-cyan-500 shrink-0" />
          </div>
          <div className="text-xl sm:text-3xl font-black text-cyan-500 truncate">{stats.totalReviewsToday}</div>
          <div className="text-[10px] opacity-70 truncate">Cards estudados</div>
        </M3Card>

        <M3Card variant="filled" className="p-3 sm:p-4 flex flex-col justify-between space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between opacity-80 text-[11px] sm:text-xs font-bold">
            <span className="truncate">Tempo Médio</span>
            <Clock className="w-4 h-4 text-purple-500 shrink-0" />
          </div>
          <div className="text-xl sm:text-3xl font-black text-purple-500 truncate">{stats.averageTimePerCard}s</div>
          <div className="text-[10px] opacity-70 truncate">Por flashcard</div>
        </M3Card>
      </div>

      {/* 60-Day Review Heatmap */}
      <M3Card variant="outlined" className="p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <h3 className="text-xs sm:text-sm font-bold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-600 shrink-0" />
            <span>Mapa de Calor de Estudos (Últimos 60 dias)</span>
          </h3>
          <span className="text-[11px] sm:text-xs opacity-70 font-semibold">Consistência Diária</span>
        </div>

        <div className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-12 gap-1.5">
          {daysGrid.map((day) => {
            let bg = 'bg-black/5 dark:bg-white/5';
            if (day.count > 0 && day.count <= 3) bg = 'bg-emerald-500/30';
            else if (day.count > 3 && day.count <= 8) bg = 'bg-emerald-500/60';
            else if (day.count > 8) bg = 'bg-emerald-500 text-white';

            return (
              <div
                key={day.dateKey}
                title={`${day.dateKey}: ${day.count} revisões`}
                className={`h-7 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all hover:scale-110 cursor-default ${bg}`}
              >
                {day.count > 0 ? day.count : ''}
              </div>
            );
          })}
        </div>
      </M3Card>

      {/* Residency Preparation Mastery Level */}
      <M3Card variant="filled" className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-600 flex items-center justify-center">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold">Nível de Prontidão para a Prova de Residência</h3>
            <p className="text-xs opacity-80">
              O algoritmo MedAnki estima que você atingiu {mastery}% de dominância no conteúdo High-Yield cadastrado.
            </p>
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <div className="flex justify-between text-xs font-semibold">
            <span>Domínio do Conteúdo Médio</span>
            <span>{mastery}% {masteryLabel}</span>
          </div>
          <div className="w-full h-3 rounded-full overflow-hidden bg-black/10 dark:bg-white/10">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500" style={{ width: `${mastery}%` }} />
          </div>
        </div>
      </M3Card>
    </div>
  );
};
