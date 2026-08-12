import React from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from 'recharts';
import { ExamDNA, ClinicalCycleDNA, BasicCycleDNA } from '../../domain/entities/Question';

const CLINICAL_SHORT_LABELS: Record<keyof ClinicalCycleDNA, string> = {
  contextoClinico: 'Contexto Clin.',
  casosLongos: 'Casos Longos',
  pegadinhas: 'Pegadinhas',
  epidemiologia: 'Epidemiologia',
  farmacologia: 'Farmacologia',
  achadosDeImagem: 'Achados Img',
  condutaImediata: 'Conduta Imed.',
  diretrizesOficiais: 'Diretrizes',
  comorbidadesMultiplas: 'Comorbidades',
};

const BASIC_SHORT_LABELS: Record<keyof BasicCycleDNA, string> = {
  memorizacaoDireta: 'Memorização',
  correlacaoAnatomoclinica: 'Correlação A-C',
  nomenclaturaTecnica: 'Terminologia',
  mecanismoFisiopatologico: 'Fisiopatologia',
  reconhecimentoEstrutural: 'Reconh. Estrut.',
  integracaoMultissistemica: 'Multissistêmico',
  basesBioquimicas: 'Bioquímica',
};

interface ExamDNARadarChartProps {
  dna: ExamDNA;
  className?: string;
}

export const ExamDNARadarChart: React.FC<ExamDNARadarChartProps> = ({ dna, className = '' }) => {
  if (!dna) return null;

  const renderSingleRadar = (
    data: { axis: string; valor: number }[],
    title: string,
    color: string
  ) => (
    <div className="flex-1 min-w-[260px] p-3 rounded-2xl bg-black/30 border border-white/10 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">{title}</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 opacity-70">
          v{dna.version || 1}
        </span>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
            <PolarGrid stroke="#ffffff20" />
            <PolarAngleAxis dataKey="axis" stroke="#94a3b8" tick={{ fontSize: 10 }} />
            <PolarRadiusAxis angle={30} domain={[0, 1]} stroke="#ffffff20" tick={{ fontSize: 9 }} />
            <Radar
              name="Peso Calibrado"
              dataKey="valor"
              stroke={color}
              fill={color}
              fillOpacity={0.35}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '11px' }}
              formatter={(val: any) => [typeof val === 'number' ? val.toFixed(2) : val, 'Peso']}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const clinicalData = dna.clinico
    ? (Object.keys(CLINICAL_SHORT_LABELS) as (keyof ClinicalCycleDNA)[]).map((key) => ({
        axis: CLINICAL_SHORT_LABELS[key],
        valor: dna.clinico![key] ?? 0.5,
      }))
    : [];

  const basicData = dna.basico
    ? (Object.keys(BASIC_SHORT_LABELS) as (keyof BasicCycleDNA)[]).map((key) => ({
        axis: BASIC_SHORT_LABELS[key],
        valor: dna.basico![key] ?? 0.5,
      }))
    : [];

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between text-xs text-indigo-300 font-semibold">
        <span>Radar DNA da Banca ({dna.cicloAcademico.toUpperCase()})</span>
        <span className="text-[10px] opacity-60">Calibrado ({dna.version || 1} análise(s))</span>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        {clinicalData.length > 0 && renderSingleRadar(clinicalData, 'Ciclo Clínico', '#818cf8')}
        {basicData.length > 0 && renderSingleRadar(basicData, 'Ciclo Básico', '#38bdf8')}
      </div>
    </div>
  );
};
