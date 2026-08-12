import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDevice } from '../../core/responsive/DeviceContext';
import { useDeveloperConsoleViewModel } from '../viewmodels/useDeveloperConsoleViewModel';
import { DeveloperModule } from '../models/DeveloperSettings';
import {
  Shield,
  Lock,
  X,
  FolderGit2,
  FileSpreadsheet,
  BookOpen,
  FileText,
  Building2,
  GraduationCap,
  BookMarked,
  FileCode,
  Bot,
  Brain,
  BarChart2,
  ScrollText,
  HardDrive,
  Settings,
  AlertCircle,
  Key,
  Layers,
  FileCheck2,
  Cpu,
  CheckCircle,
  Sparkles,
  FolderOpen,
  ArrowLeft,
} from 'lucide-react';
import { DeveloperLibraryView } from './DeveloperLibraryView';
import { MedCoreArchitectureView } from './MedCoreArchitectureView';
import { ExamBankView } from '../../core/exam_bank';
import { BooksView } from '../../core/books';
import { GuidelinesView } from '../../core/guidelines';
import { AdminDashboardView } from '../../core/dashboard';
import { ImportQueueAdminView } from './ImportQueueAdminView';
import { AdminSettingsAdminView } from './AdminSettingsAdminView';
import { AuditReportView } from './AuditReportView';
import { BancasProfessoresView } from './BancasProfessoresView';
import { LivingCardApprovalView } from './LivingCardApprovalView';
import { knowledgeGraphService } from '../../data/services/KnowledgeGraphService';
import { Trash2 } from 'lucide-react';

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  FolderOpen,
  FolderGit2,
  FileSpreadsheet,
  BookOpen,
  FileText,
  Building2,
  GraduationCap,
  BookMarked,
  FileCode,
  Bot,
  Brain,
  BarChart2,
  ScrollText,
  HardDrive,
  Settings,
};

export const DeveloperConsoleView: React.FC = () => {
  const { colors } = useDevice();
  const {
    isConsoleOpen,
    closeConsoleView,
    modules,
    auditLogs,
    changePin,
  } = useDeveloperConsoleViewModel();

  const [activeTab, setActiveTab] = useState<
    'modules' | 'architecture' | 'logs' | 'settings' | 'import-queue' | 'admin-settings' | 'living-cards' | 'audit-report'
  >('modules');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedModule, setSelectedModule] = useState<DeveloperModule | null>(null);
  const [activeModuleView, setActiveModuleView] = useState<string | null>(null);

  // PIN Change modal state
  const [showPinModal, setShowPinModal] = useState<boolean>(false);
  const [currentPin, setCurrentPin] = useState<string>('');
  const [newPin, setNewPin] = useState<string>('');
  const [confirmPin, setConfirmPin] = useState<string>('');
  const [pinFeedback, setPinFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Knowledge Graph Cleanup State
  const [graphCleanupResult, setGraphCleanupResult] = useState<{ edgesRemoved: number; linksRemoved: number } | null>(null);
  const [isCleaningGraph, setIsCleaningGraph] = useState<boolean>(false);

  const handleCleanupGraph = async () => {
    try {
      setIsCleaningGraph(true);
      const res = await knowledgeGraphService.cleanupObsoleteGraphEdges();
      setGraphCleanupResult(res);
    } catch (err: any) {
      alert(`Erro ao limpar grafo: ${err.message || String(err)}`);
    } finally {
      setIsCleaningGraph(false);
    }
  };

  if (!isConsoleOpen) return null;

  const activeModules = modules.filter((m) => m.status === 'Ativo');
  const roadmapModules = modules.filter((m) => m.status !== 'Ativo');

  const categories = [
    { id: 'all', label: 'Todos os Módulos' },
    { id: 'knowledge', label: 'Knowledge & Diretrizes' },
    { id: 'sources', label: 'Fontes & Conteúdo' },
    { id: 'ai', label: 'IA & Embeddings' },
    { id: 'system', label: 'Sistema & Auditoria' },
  ];

  const filteredActiveModules = activeModules.filter(
    (m) => selectedCategory === 'all' || m.category === selectedCategory
  );

  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin !== confirmPin) {
      setPinFeedback({ success: false, message: 'Os novos PINs digitados não coincidem.' });
      return;
    }

    const res = changePin(currentPin, newPin);
    setPinFeedback(res);
    if (res.success) {
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setTimeout(() => {
        setPinFeedback(null);
        setShowPinModal(false);
      }, 1500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/95 backdrop-blur-md text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-10 px-6 py-4 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">Developer Console</h1>
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                v1.0 • Restrito
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Infraestrutura Central & Painel Administrativo de Engenharia do MedAnki
            </p>
          </div>
        </div>

        {/* Navigation Tabs & Actions */}
        <div className="flex items-center gap-3">
          <nav className="hidden md:flex items-center gap-1 bg-slate-800/60 p-1 rounded-2xl border border-slate-700/50 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('modules')}
              className={`px-3.5 py-1.5 rounded-xl transition-all ${
                activeTab === 'modules' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Módulos ({activeModules.length})
            </button>
            <button
              onClick={() => setActiveTab('architecture')}
              className={`px-3.5 py-1.5 rounded-xl transition-all ${
                activeTab === 'architecture' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Arquitetura Futura
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-3.5 py-1.5 rounded-xl transition-all ${
                activeTab === 'logs' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Auditoria & Logs ({auditLogs.length})
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3.5 py-1.5 rounded-xl transition-all ${
                activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Segurança & PIN
            </button>
            <button
              onClick={() => setActiveTab('import-queue')}
              className={`px-3.5 py-1.5 rounded-xl transition-all ${
                activeTab === 'import-queue' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Fila (18.8)
            </button>
            <button
              onClick={() => setActiveTab('admin-settings')}
              className={`px-3.5 py-1.5 rounded-xl transition-all ${
                activeTab === 'admin-settings' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Configs Admin (18.9)
            </button>
            <button
              onClick={() => setActiveTab('living-cards')}
              className={`px-3.5 py-1.5 rounded-xl transition-all font-bold ${
                activeTab === 'living-cards' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              🌱 Flashcards Vivos
            </button>
            <button
              onClick={() => setActiveTab('audit-report')}
              className={`px-3.5 py-1.5 rounded-xl transition-all ${
                activeTab === 'audit-report' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Auditoria (18.10)
            </button>
          </nav>

          <button
            onClick={() => setShowPinModal(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-300 transition-colors"
          >
            <Key className="w-3.5 h-3.5 text-indigo-400" />
            <span>Alterar PIN</span>
          </button>

          <button
            onClick={closeConsoleView}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 text-xs font-bold transition-all"
          >
            <X className="w-4 h-4" />
            <span>Sair do Painel</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Active Module View */}
        {activeModuleView === 'medcore-library' ? (
          <div className="space-y-4">
            <button
              onClick={() => setActiveModuleView(null)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors inline-flex items-center gap-2 border border-slate-700"
            >
              <ArrowLeft className="w-4 h-4 text-indigo-400" />
              <span>Voltar aos Módulos</span>
            </button>
            <DeveloperLibraryView />
          </div>
        ) : activeModuleView === 'exam-bank' ? (
          <div className="space-y-4">
            <button
              onClick={() => setActiveModuleView(null)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors inline-flex items-center gap-2 border border-slate-700"
            >
              <ArrowLeft className="w-4 h-4 text-indigo-400" />
              <span>Voltar aos Módulos</span>
            </button>
            <ExamBankView />
          </div>
        ) : activeModuleView === 'books' ? (
          <div className="space-y-4">
            <button
              onClick={() => setActiveModuleView(null)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors inline-flex items-center gap-2 border border-slate-700"
            >
              <ArrowLeft className="w-4 h-4 text-indigo-400" />
              <span>Voltar aos Módulos</span>
            </button>
            <BooksView />
          </div>
        ) : activeModuleView === 'guidelines' ? (
          <div className="space-y-4">
            <button
              onClick={() => setActiveModuleView(null)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors inline-flex items-center gap-2 border border-slate-700"
            >
              <ArrowLeft className="w-4 h-4 text-teal-400" />
              <span>Voltar aos Módulos</span>
            </button>
            <GuidelinesView />
          </div>
        ) : activeModuleView === 'statistics' ? (
          <div className="space-y-4">
            <button
              onClick={() => setActiveModuleView(null)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors inline-flex items-center gap-2 border border-slate-700"
            >
              <ArrowLeft className="w-4 h-4 text-indigo-400" />
              <span>Voltar aos Módulos</span>
            </button>
            <AdminDashboardView />
          </div>
        ) : activeModuleView === 'file-importer' ? (
          <div className="space-y-4">
            <button
              onClick={() => setActiveModuleView(null)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors inline-flex items-center gap-2 border border-slate-700"
            >
              <ArrowLeft className="w-4 h-4 text-indigo-400" />
              <span>Voltar aos Módulos</span>
            </button>
            <ImportQueueAdminView />
          </div>
        ) : activeModuleView === 'bancas' ? (
          <div className="space-y-4">
            <button
              onClick={() => setActiveModuleView(null)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors inline-flex items-center gap-2 border border-slate-700"
            >
              <ArrowLeft className="w-4 h-4 text-indigo-400" />
              <span>Voltar aos Módulos</span>
            </button>
            <BancasProfessoresView type="banca" />
          </div>
        ) : activeModuleView === 'professors' ? (
          <div className="space-y-4">
            <button
              onClick={() => setActiveModuleView(null)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors inline-flex items-center gap-2 border border-slate-700"
            >
              <ArrowLeft className="w-4 h-4 text-purple-400" />
              <span>Voltar aos Módulos</span>
            </button>
            <BancasProfessoresView type="professor" />
          </div>
        ) : (
          <>
            {/* Mobile Navigation Tabs */}
        <div className="flex md:hidden items-center justify-between gap-1 bg-slate-900 p-1 rounded-2xl border border-slate-800 text-xs font-medium overflow-x-auto">
          <button
            onClick={() => setActiveTab('modules')}
            className={`px-3 py-2 rounded-xl whitespace-nowrap ${
              activeTab === 'modules' ? 'bg-indigo-600 text-white' : 'text-slate-400'
            }`}
          >
            Módulos
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`px-3 py-2 rounded-xl whitespace-nowrap ${
              activeTab === 'architecture' ? 'bg-indigo-600 text-white' : 'text-slate-400'
            }`}
          >
            Arquitetura
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-2 rounded-xl whitespace-nowrap ${
              activeTab === 'logs' ? 'bg-indigo-600 text-white' : 'text-slate-400'
            }`}
          >
            Logs
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-2 rounded-xl whitespace-nowrap ${
              activeTab === 'settings' ? 'bg-indigo-600 text-white' : 'text-slate-400'
            }`}
          >
            Segurança
          </button>
        </div>

        {/* TAB 1: MODULES GRID */}
        {activeTab === 'modules' && (
          <div className="space-y-6">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                    selectedCategory === cat.id
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Active Modules Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredActiveModules.map((module) => {
                const IconComponent = ICON_MAP[module.iconName] || FolderGit2;

                return (
                  <motion.div
                    key={module.id}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => {
                      if (module.id === 'settings') {
                        setActiveTab('admin-settings');
                      } else if (module.id === 'logs') {
                        setActiveTab('audit-report');
                      } else {
                        setActiveModuleView(module.id);
                      }
                    }}
                    className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 hover:border-indigo-500/40 transition-all cursor-pointer flex flex-col justify-between gap-4 group relative overflow-hidden shadow-sm"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="w-10 h-10 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                          <IconComponent className="w-5 h-5" />
                        </div>

                        <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          {module.status}
                        </span>
                      </div>

                      <div>
                        <h3 className="font-bold text-sm text-white group-hover:text-indigo-300 transition-colors">
                          {module.name}
                        </h3>
                        <p className="text-xs text-slate-400 leading-relaxed line-clamp-2 mt-1">
                          {module.description}
                        </p>
                      </div>
                    </div>

                    {/* Future format tags */}
                    {module.futureFormats && module.futureFormats.length > 0 && (
                      <div className="pt-3 border-t border-slate-800/80 flex items-center gap-1.5 flex-wrap">
                        {module.futureFormats.map((fmt, i) => (
                          <span
                            key={i}
                            className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-slate-800/60 text-slate-400 border border-slate-700/50"
                          >
                            {fmt}
                          </span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Compact Roadmap / Próximas Fases Section */}
            {roadmapModules.length > 0 && (
              <div className="pt-6 border-t border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    <span>Próximas Fases & Roadmap (Módulos Planejados)</span>
                  </h3>
                  <span className="text-[11px] text-slate-500">
                    {roadmapModules.length} em planejamento
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {roadmapModules.map((mod) => {
                    const IconComp = ICON_MAP[mod.iconName] || FolderGit2;
                    return (
                      <div
                        key={mod.id}
                        className="p-3.5 rounded-2xl bg-slate-900/40 border border-slate-800/60 flex items-center gap-3"
                      >
                        <div className="w-8 h-8 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-slate-400 shrink-0">
                          <IconComp className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-xs text-slate-300 truncate">
                              {mod.name}
                            </span>
                            <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700/50 shrink-0">
                              Em dev
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 truncate mt-0.5">
                            {mod.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ARCHITECTURE PREPARATION */}
        {activeTab === 'architecture' && <MedCoreArchitectureView />}

        {/* TAB 3: AUDIT & LOGS */}
        {activeTab === 'logs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <ScrollText className="w-5 h-5 text-indigo-400" />
                <span>Trilha de Auditoria & Logs de Segurança</span>
              </h2>
              <span className="text-xs text-slate-400">Total de eventos: {auditLogs.length}</span>
            </div>

            <div className="rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden">
              {auditLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Nenhum registro de auditoria disponível.
                </div>
              ) : (
                <div className="divide-y divide-slate-800 text-xs font-mono">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="p-4 space-y-1.5 hover:bg-slate-800/50 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`font-bold px-2 py-0.5 rounded ${
                            log.success
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {log.success ? 'SUCESSO' : 'FALHA / ALERTA'}
                        </span>
                        <span className="text-slate-500">{new Date(log.timestamp).toLocaleString('pt-BR')}</span>
                      </div>
                      <p className="text-slate-300 font-sans text-xs">{log.reason}</p>
                      {log.attemptCount > 0 && (
                        <p className="text-slate-500 text-[11px]">
                          Contador de tentativas incorretas no evento: {log.attemptCount}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: SECURITY & PIN SETTINGS */}
        {activeTab === 'settings' && (
          <div className="max-w-xl mx-auto space-y-6">
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Gerenciamento de Credencial PIN</h2>
                  <p className="text-xs text-slate-400">
                    O PIN do desenvolvedor é armazenado de forma isolada via Secure Storage abstraction.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowPinModal(true)}
                className="w-full py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2"
              >
                <Key className="w-4 h-4" />
                <span>Alterar PIN do Desenvolvedor</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 5: IMPORT QUEUE ADMIN (18.8) */}
        {activeTab === 'import-queue' && <ImportQueueAdminView />}

        {/* TAB 6: ADMIN SETTINGS (18.9) */}
        {activeTab === 'admin-settings' && (
          <div className="space-y-6">
            <AdminSettingsAdminView />

            {/* Knowledge Graph Maintenance Section */}
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Manutenção do Grafo de Conhecimento</h3>
                    <p className="text-xs text-slate-400">
                      Varre o IndexedDB purgando links e arestas (graphEdges) órfãs de conteúdos excluídos.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isCleaningGraph}
                  onClick={handleCleanupGraph}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isCleaningGraph ? 'Limpando Grafo...' : 'Limpar Grafo'}</span>
                </button>
              </div>

              {graphCleanupResult && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between">
                  <span>Limpeza concluída com sucesso!</span>
                  <span>Arestas removidas: {graphCleanupResult.edgesRemoved} | Links órfãos removidos: {graphCleanupResult.linksRemoved}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 7: LIVING FLASHCARDS APPROVAL QUEUE */}
        {activeTab === 'living-cards' && <LivingCardApprovalView />}

        {/* TAB 8: AUDIT REPORT (18.10) */}
        {activeTab === 'audit-report' && <AuditReportView />}
          </>
        )}
      </main>

      {/* PIN Change Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl p-6 bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-indigo-400" />
                <span>Alterar PIN Secreto</span>
              </h3>
              <button onClick={() => setShowPinModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePin} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">PIN Atual</label>
                <input
                  type="password"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">Novo PIN</label>
                <input
                  type="password"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-medium">Confirmar Novo PIN</label>
                <input
                  type="password"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono outline-none focus:border-indigo-500"
                />
              </div>

              {pinFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-medium ${
                    pinFeedback.success
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {pinFeedback.message}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPinModal(false)}
                  className="px-3.5 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                >
                  Salvar PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Module Detail Modal */}
      {selectedModule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl p-6 bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <span>{selectedModule.name}</span>
              </h3>
              <button onClick={() => setSelectedModule(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">{selectedModule.description}</p>

            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 space-y-1">
              <span className="font-bold">Status: {selectedModule.status}</span>
              <p className="opacity-80">
                Este módulo está reservado e configurado na arquitetura para receber funcionalidades nas próximas fases do projeto.
              </p>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSelectedModule(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-200 font-bold hover:bg-slate-700"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
