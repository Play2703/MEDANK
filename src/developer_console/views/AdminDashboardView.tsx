/**
 * Developer Console - AdminDashboardView Component (Phase 18.7)
 *
 * Administrative Dashboard showing statistics, Recharts Material 3 visualizations,
 * storage used, last upload, and files per category with auto-update.
 */

import React from 'react';
import { motion } from 'motion/react';
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  FileCheck,
  HardDrive,
  Clock,
  Database,
  BarChart3,
  PieChart as PieIcon,
  RefreshCw,
  Award,
  Layers,
} from 'lucide-react';
import { useDashboardViewModel } from '../../core/dashboard';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid } from 'recharts';

const COLORS = ['#6366f1', '#14b8a6', '#f59e0b', '#ec4899', '#3b82f6', '#10b981', '#8b5cf6', '#f43f5e'];

export const AdminDashboardView: React.FC = () => {
  const { stats, isLoading, refresh } = useDashboardViewModel();

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950/80 to-slate-950 border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-xl bg-indigo-500/20 text-indigo-300 font-mono text-xs font-bold border border-indigo-500/30">
              Fase 18.7
            </span>
            <span className="text-xs text-slate-400 font-medium">Dashboard Administrativo & Telemetria</span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
            <LayoutDashboard className="w-7 h-7 text-indigo-400" />
            <span>Painel Geral MedCore Engine</span>
          </h2>
          <p className="text-xs text-slate-400 max-w-xl">
            Monitoramento em tempo real de acervos, volumes de armazenamento, distribuições por categoria e estatísticas unificadas.
          </p>
        </div>

        <button
          onClick={refresh}
          className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Atualizar Dados</span>
        </button>
      </div>

      {/* Hero Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Books Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3 group hover:border-indigo-500/40 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total de Livros</span>
            <div className="p-2 rounded-2xl bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-3xl font-black text-white">{stats.booksCount}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Tratados e Obras</p>
          </div>
        </motion.div>

        {/* Exams Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3 group hover:border-amber-500/40 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Banco de Provas</span>
            <div className="p-2 rounded-2xl bg-amber-500/15 text-amber-300 border border-amber-500/30">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-3xl font-black text-white">{stats.examsCount}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Provas & Residências</p>
          </div>
        </motion.div>

        {/* Guidelines Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3 group hover:border-teal-500/40 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Diretrizes Médicas</span>
            <div className="p-2 rounded-2xl bg-teal-500/15 text-teal-300 border border-teal-500/30">
              <FileCheck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-3xl font-black text-white">{stats.guidelinesCount}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Protocolos Oficiais</p>
          </div>
        </motion.div>

        {/* PDFs & DOCX Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3 group hover:border-pink-500/40 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Arquivos PDF / DOCX</span>
            <div className="p-2 rounded-2xl bg-pink-500/15 text-pink-300 border border-pink-500/30">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-3xl font-black text-white">{stats.pdfsCount + stats.docxCount}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">{stats.pdfsCount} PDFs • {stats.docxCount} DOCX</p>
          </div>
        </motion.div>

        {/* Storage Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-3 group hover:border-emerald-500/40 transition-all sm:col-span-2 lg:col-span-1"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Espaço Utilizado</span>
            <div className="p-2 rounded-2xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-black text-white truncate">{stats.totalStorageFormatted}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Persistência Local (IndexedDB/LS)</p>
          </div>
        </motion.div>
      </div>

      {/* Secondary Bar: Last Upload & Quick status */}
      <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 font-mono">Último Upload / Registro</p>
            <h4 className="text-sm font-bold text-white truncate max-w-md">{stats.lastUpload.title}</h4>
            <p className="text-xs text-indigo-300">{stats.lastUpload.type} • {stats.lastUpload.date}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-slate-400 bg-slate-950 px-4 py-3 rounded-2xl border border-slate-800">
          <div>Total de Registros: <span className="text-white font-bold">{stats.totalItemsCount}</span></div>
          <div className="w-px h-4 bg-slate-800"></div>
          <div>Status Sincronismo: <span className="text-emerald-400 font-bold">Ativo</span></div>
        </div>
      </div>

      {/* Recharts Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Files per Category Bar Chart */}
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <BarChart3 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Arquivos por Categoria / Banca</h3>
                <p className="text-[11px] text-slate-400">Distribuição quantitativa do acervo</p>
              </div>
            </div>
            <span className="text-xs font-mono text-indigo-400">{stats.categoryDistribution.length} categorias</span>
          </div>

          <div className="h-72 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.categoryDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} angle={-30} textAnchor="end" interval={0} />
                <YAxis stroke="#94a3b8" fontSize={10} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '1rem', color: '#fff', fontSize: '12px' }}
                />
                <Bar dataKey="count" fill="#6366f1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Format Distribution Pie Chart */}
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
                <PieIcon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Distribuição por Formato de Arquivo</h3>
                <p className="text-[11px] text-slate-400">Proporção PDF vs DOCX vs Outros</p>
              </div>
            </div>
            <span className="text-xs font-mono text-teal-400">{stats.pdfsCount + stats.docxCount} arquivos</span>
          </div>

          <div className="h-72 w-full flex items-center justify-center pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.formatDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={105}
                  paddingAngle={5}
                  dataKey="count"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {stats.formatDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '1rem', color: '#fff', fontSize: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
