/**
 * Developer Console - ExamBankView Component (Phase 18.4)
 *
 * Banco de Provas - Central repository of medical residency and Revalida exams.
 * Fully functional CRUD, search, filter by category/year, sort, annotations,
 * tags, answer keys (gabarito), and Material 3 dark premium interface.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText,
  Plus,
  Search,
  Building2,
  Calendar,
  Award,
  BookOpen,
  Trash2,
  Eye,
  RefreshCw,
  CheckCircle2,
  Tag,
  FileCheck,
  HardDrive,
  X,
  Layers,
} from 'lucide-react';
import { useExamViewModel, EXAM_CATEGORIES, ExamCategory, ExamModel, ExamCreateDTO } from '../../core/exam_bank';

export const ExamBankView: React.FC = () => {
  const {
    exams,
    allExamsCount,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    selectedYear,
    setSelectedYear,
    sortBy,
    setSortBy,
    isCreateModalOpen,
    setIsCreateModalOpen,
    isDetailModalOpen,
    setIsDetailModalOpen,
    selectedExamForDetail,
    setSelectedExamForDetail,
    createExam,
    updateExam,
    deleteExam,
    resetToSeed,
    stats,
  } = useExamViewModel();

  // Create form state
  const [newTitulo, setNewTitulo] = useState('');
  const [newInstituicao, setNewInstituicao] = useState('');
  const [newProfessor, setNewProfessor] = useState('');
  const [newDisciplina, setNewDisciplina] = useState('');
  const [newEspecialidade, setNewEspecialidade] = useState('');
  const [newAno, setNewAno] = useState(2026);
  const [newSemestre, setNewSemestre] = useState('Anual');
  const [newTipo, setNewTipo] = useState<ExamCategory>('ENARE');
  const [newObservacoes, setNewObservacoes] = useState('');
  const [newConteudoTexto, setNewConteudoTexto] = useState('');
  const [newTags, setNewTags] = useState('Residência, Prova Oficial');
  const [newGabarito, setNewGabarito] = useState('');
  const [newArquivo, setNewArquivo] = useState('Prova_MedCore.pdf');

  // Edit state in detail modal
  const [isEditing, setIsEditing] = useState(false);
  const [editTitulo, setEditTitulo] = useState('');
  const [editInstituicao, setEditInstituicao] = useState('');
  const [editProfessor, setEditProfessor] = useState('');
  const [editDisciplina, setEditDisciplina] = useState('');
  const [editEspecialidade, setEditEspecialidade] = useState('');
  const [editAno, setEditAno] = useState(2026);
  const [editSemestre, setEditSemestre] = useState('');
  const [editTipo, setEditTipo] = useState<ExamCategory>('ENARE');
  const [editObservacoes, setEditObservacoes] = useState('');
  const [editConteudoTexto, setEditConteudoTexto] = useState('');
  const [editGabarito, setEditGabarito] = useState('');

  const openDetailModal = (exam: ExamModel) => {
    setSelectedExamForDetail(exam);
    setEditTitulo(exam.titulo);
    setEditInstituicao(exam.instituição);
    setEditProfessor(exam.professor);
    setEditDisciplina(exam.disciplina);
    setEditEspecialidade(exam.especialidade);
    setEditAno(exam.ano);
    setEditSemestre(exam.semestre);
    setEditTipo(exam.tipo);
    setEditObservacoes(exam.observacoes);
    setEditConteudoTexto(exam.conteudoTexto || '');
    setEditGabarito(exam.gabarito);
    setIsEditing(false);
    setIsDetailModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitulo.trim()) return;

    const tagsArray = newTags.split(',').map((t) => t.trim()).filter(Boolean);

    const dto: ExamCreateDTO = {
      titulo: newTitulo,
      instituição: newInstituicao || 'Instituição Independente',
      professor: newProfessor || 'Comissão Examinadora',
      disciplina: newDisciplina || 'Clínica Médica',
      especialidade: newEspecialidade || 'Multidisciplinar',
      ano: Number(newAno) || 2026,
      semestre: newSemestre,
      tipo: newTipo,
      observacoes: newObservacoes,
      conteudoTexto: newConteudoTexto.trim() || undefined,
      tags: tagsArray,
      arquivoOriginal: newArquivo,
      tamanhoArquivo: 5242880, // 5MB default mock
      gabarito: newGabarito,
    };

    await createExam(dto);
    setNewTitulo('');
    setNewInstituicao('');
    setNewProfessor('');
    setNewObservacoes('');
    setNewConteudoTexto('');
    setNewGabarito('');
  };

  const handleSaveEdit = async () => {
    if (!selectedExamForDetail) return;
    await updateExam(selectedExamForDetail.id, {
      titulo: editTitulo,
      instituição: editInstituicao,
      professor: editProfessor,
      disciplina: editDisciplina,
      especialidade: editEspecialidade,
      ano: editAno,
      semestre: editSemestre,
      tipo: editTipo,
      observacoes: editObservacoes,
      conteudoTexto: editConteudoTexto.trim() || undefined,
      gabarito: editGabarito,
    });
    setIsEditing(false);
    setSelectedExamForDetail({
      ...selectedExamForDetail,
      titulo: editTitulo,
      instituição: editInstituicao,
      professor: editProfessor,
      disciplina: editDisciplina,
      especialidade: editEspecialidade,
      ano: editAno,
      semestre: editSemestre,
      tipo: editTipo,
      observacoes: editObservacoes,
      conteudoTexto: editConteudoTexto.trim() || undefined,
      gabarito: editGabarito,
    });
  };

  const categoriesFilterList = ['Todas', ...EXAM_CATEGORIES];
  const yearsList = ['Todos', '2026', '2025', '2024', '2023', '2022', '2021'];

  return (
    <div className="w-full space-y-6 text-slate-100">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold shadow-inner">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-white">Banco de Provas do MedCore</h1>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold">
                  Fase 18.4
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Repositório central de provas oficiais de residência médica, Revalida e bancas examinadoras.
              </p>
            </div>
          </div>
        </div>

        {/* Top Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => resetToSeed()}
            className="px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors flex items-center gap-2 border border-slate-700"
            title="Restaurar Provas Padrão"
          >
            <RefreshCw className="w-4 h-4 text-slate-400" />
            <span className="hidden sm:inline">Restaurar Padrão</span>
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2.5 transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Prova</span>
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Total de Provas
            </span>
            <div className="text-2xl font-black text-white">{stats.totalExams}</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Instituições / Bancas
            </span>
            <div className="text-2xl font-black text-white">{stats.institutionsCount}</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Categorias Ativas
            </span>
            <div className="text-2xl font-black text-emerald-400">{stats.categoriesCount}</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Volume Armazenado
            </span>
            <div className="text-2xl font-black text-indigo-400">{stats.totalSizeFormatted}</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <HardDrive className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="p-1.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        {categoriesFilterList.map((cat) => {
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>{cat === 'Todas' ? '🌐' : '📜'}</span>
              <span>{cat}</span>
            </button>
          );
        })}
      </div>

      {/* Search, Year Filter & Sort Toolbar */}
      <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar por título, instituição, disciplina, especialidade ou tags..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-white outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Year Filter */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 outline-none focus:border-indigo-500"
          >
            {yearsList.map((yr) => (
              <option key={yr} value={yr}>
                {yr === 'Todos' ? 'Todos os Anos' : `Ano: ${yr}`}
              </option>
            ))}
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 outline-none focus:border-indigo-500"
          >
            <option value="date">Ordenar: Recém Adicionadas</option>
            <option value="year">Ordenar: Ano da Prova (Recente)</option>
            <option value="title">Ordenar: Título (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Exams Grid View */}
      {isLoading ? (
        <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Carregando Banco de Provas...</p>
        </div>
      ) : error ? (
        <div className="p-8 rounded-3xl bg-rose-950/20 border border-rose-500/30 text-center space-y-2">
          <p className="text-xs text-rose-200">{error}</p>
        </div>
      ) : exams.length === 0 ? (
        <div className="p-12 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto">
            <FileText className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Nenhuma Prova Encontrada</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Nenhuma prova corresponde aos filtros selecionados. Clique em "Adicionar Prova" para cadastrar novas provas.
            </p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Prova</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {exams.map((exam) => (
            <div
              key={exam.id}
              onClick={() => openDetailModal(exam)}
              className="p-5 rounded-3xl bg-slate-900 border border-slate-800 hover:border-indigo-500/40 cursor-pointer transition-all space-y-4 flex flex-col justify-between group shadow-lg"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-3 py-1 rounded-xl bg-indigo-500/15 text-indigo-300 font-mono text-[10px] font-bold border border-indigo-500/30">
                      {exam.tipo} ({exam.ano})
                    </span>
                    {exam.conteudoTexto && exam.conteudoTexto.trim().length > 30 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-mono border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        Grafo (NER)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/30">
                        Não indexado
                      </span>
                    )}
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-mono text-[10px]">
                    {exam.semestre}
                  </span>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors line-clamp-2">
                    {exam.titulo}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 truncate">
                    <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">{exam.instituição}</span>
                  </p>
                </div>

                <div className="space-y-1 text-xs text-slate-400 bg-slate-950 p-3 rounded-2xl border border-slate-800/80">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Disciplina:</span>
                    <span className="text-slate-200 font-medium truncate max-w-[160px]">{exam.disciplina}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Professor:</span>
                    <span className="text-slate-200 font-medium truncate max-w-[160px]">{exam.professor}</span>
                  </div>
                  {exam.gabarito && (
                    <div className="flex items-center gap-1 text-emerald-400 font-semibold pt-1">
                      <FileCheck className="w-3.5 h-3.5" />
                      <span>Gabarito Disponível</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
                <span className="font-mono">{exam.tamanhoFormatado}</span>
                <div className="flex items-center gap-1 text-indigo-400 font-bold group-hover:translate-x-1 transition-transform">
                  <span>Ver Detalhes</span>
                  <span>→</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Exam Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5 text-slate-100 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-white">Cadastrar Nova Prova</h3>
                    <p className="text-xs text-slate-400">Adicionar prova ao repositório central do MedCore</p>
                  </div>
                </div>
                <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Título da Prova *</label>
                  <input
                    type="text"
                    required
                    value={newTitulo}
                    onChange={(e) => setNewTitulo(e.target.value)}
                    placeholder="Ex: Prova ENARE Residência Médica 2026"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-slate-400 font-semibold">Categoria / Banca</label>
                    <select
                      value={newTipo}
                      onChange={(e) => setNewTipo(e.target.value as ExamCategory)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                    >
                      {EXAM_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-400 font-semibold">Instituição / Organizadora</label>
                    <input
                      type="text"
                      value={newInstituicao}
                      onChange={(e) => setNewInstituicao(e.target.value)}
                      placeholder="Ex: USP - FMUSP"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-slate-400 font-semibold">Ano</label>
                    <input
                      type="number"
                      value={newAno}
                      onChange={(e) => setNewAno(parseInt(e.target.value, 10) || 2026)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-400 font-semibold">Semestre</label>
                    <select
                      value={newSemestre}
                      onChange={(e) => setNewSemestre(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                    >
                      <option value="Anual">Anual</option>
                      <option value="1º Semestre">1º Semestre</option>
                      <option value="2º Semestre">2º Semestre</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-400 font-semibold">Professor / Banca</label>
                    <input
                      type="text"
                      value={newProfessor}
                      onChange={(e) => setNewProfessor(e.target.value)}
                      placeholder="Ex: Banca Oficial USP"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-slate-400 font-semibold">Disciplina</label>
                    <input
                      type="text"
                      value={newDisciplina}
                      onChange={(e) => setNewDisciplina(e.target.value)}
                      placeholder="Ex: Clínica Médica"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-400 font-semibold">Especialidade</label>
                    <input
                      type="text"
                      value={newEspecialidade}
                      onChange={(e) => setNewEspecialidade(e.target.value)}
                      placeholder="Ex: Cardiologia e UTI"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold flex items-center justify-between">
                    <span>Conteúdo da Prova (texto completo ou principais questões)</span>
                    <span className="text-[10px] text-indigo-400 font-mono">Alimenta RAG & Grafo NER</span>
                  </label>
                  <textarea
                    rows={4}
                    value={newConteudoTexto}
                    onChange={(e) => setNewConteudoTexto(e.target.value)}
                    placeholder="Cole o texto das questões da prova para extração automática de CIDs, entidades e relações..."
                    className="w-full p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500 font-mono text-xs leading-relaxed"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Observações / Anotações</label>
                  <textarea
                    rows={2}
                    value={newObservacoes}
                    onChange={(e) => setNewObservacoes(e.target.value)}
                    placeholder="Detalhes relevantes sobre o estilo de cobrança..."
                    className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Gabarito (Opcional)</label>
                  <input
                    type="text"
                    value={newGabarito}
                    onChange={(e) => setNewGabarito(e.target.value)}
                    placeholder="Ex: Gabarito definitivo oficial publicado em dd/mm/aaaa"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Tags (separadas por vírgula)</label>
                  <input
                    type="text"
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-600/30"
                  >
                    Salvar Prova
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detail / Edit Exam Modal */}
      <AnimatePresence>
        {isDetailModalOpen && selectedExamForDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-3xl rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-6 text-slate-100 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 rounded-xl bg-indigo-500/20 text-indigo-300 font-mono text-xs font-bold border border-indigo-500/30">
                    {selectedExamForDetail.tipo} ({selectedExamForDetail.ano})
                  </span>
                  <h3 className="font-bold text-base text-white">Detalhes da Prova</h3>
                </div>

                <div className="flex items-center gap-2">
                  {!isEditing ? (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                    >
                      Editar Metadados
                    </button>
                  ) : (
                    <button
                      onClick={handleSaveEdit}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white"
                    >
                      Salvar Alterações
                    </button>
                  )}
                  <button onClick={() => setIsDetailModalOpen(false)} className="text-slate-400 hover:text-white p-1">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Information / Edit fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1 md:col-span-2">
                  <label className="text-slate-400 font-semibold">Título</label>
                  {!isEditing ? (
                    <p className="text-white font-bold text-sm bg-slate-950 p-3 rounded-xl border border-slate-800">
                      {selectedExamForDetail.titulo}
                    </p>
                  ) : (
                    <input
                      type="text"
                      value={editTitulo}
                      onChange={(e) => setEditTitulo(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-indigo-500 rounded-xl text-white outline-none"
                    />
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Instituição</label>
                  {!isEditing ? (
                    <p className="text-slate-200 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                      {selectedExamForDetail.instituição}
                    </p>
                  ) : (
                    <input
                      type="text"
                      value={editInstituicao}
                      onChange={(e) => setEditInstituicao(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-indigo-500 rounded-xl text-white outline-none"
                    />
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Tipo / Categoria</label>
                  {!isEditing ? (
                    <p className="text-slate-200 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                      {selectedExamForDetail.tipo}
                    </p>
                  ) : (
                    <select
                      value={editTipo}
                      onChange={(e) => setEditTipo(e.target.value as ExamCategory)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-indigo-500 rounded-xl text-white outline-none"
                    >
                      {EXAM_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Disciplina / Especialidade</label>
                  {!isEditing ? (
                    <p className="text-slate-200 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                      {selectedExamForDetail.disciplina} • {selectedExamForDetail.especialidade}
                    </p>
                  ) : (
                    <input
                      type="text"
                      value={editDisciplina}
                      onChange={(e) => setEditDisciplina(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-indigo-500 rounded-xl text-white outline-none"
                    />
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Ano / Semestre</label>
                  {!isEditing ? (
                    <p className="text-slate-200 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                      {selectedExamForDetail.ano} ({selectedExamForDetail.semestre})
                    </p>
                  ) : (
                    <input
                      type="number"
                      value={editAno}
                      onChange={(e) => setEditAno(parseInt(e.target.value, 10) || 2026)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-indigo-500 rounded-xl text-white outline-none"
                    />
                  )}
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-slate-400 font-semibold">Gabarito</label>
                  {!isEditing ? (
                    <p className="text-emerald-300 bg-slate-950 p-3 rounded-xl border border-slate-800">
                      {selectedExamForDetail.gabarito || 'Nenhum gabarito cadastrado.'}
                    </p>
                  ) : (
                    <input
                      type="text"
                      value={editGabarito}
                      onChange={(e) => setEditGabarito(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-indigo-500 rounded-xl text-white outline-none"
                    />
                  )}
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-slate-400 font-semibold flex items-center justify-between">
                    <span>Conteúdo Completo da Prova (para Indexação RAG & Grafo NER)</span>
                    <span className="text-[10px] text-indigo-400 font-mono">NER RAG</span>
                  </label>
                  {!isEditing ? (
                    <p className="text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800 leading-relaxed font-mono text-xs max-h-36 overflow-y-auto">
                      {selectedExamForDetail.conteudoTexto || 'Nenhum conteúdo textual indexado.'}
                    </p>
                  ) : (
                    <textarea
                      rows={5}
                      value={editConteudoTexto}
                      onChange={(e) => setEditConteudoTexto(e.target.value)}
                      placeholder="Cole o texto completo das questões..."
                      className="w-full p-3 bg-slate-950 border border-indigo-500 rounded-xl text-white outline-none font-mono text-xs leading-relaxed"
                    />
                  )}
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-slate-400 font-semibold">Observações</label>
                  {!isEditing ? (
                    <p className="text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800 leading-relaxed">
                      {selectedExamForDetail.observacoes || 'Nenhuma observação.'}
                    </p>
                  ) : (
                    <textarea
                      rows={3}
                      value={editObservacoes}
                      onChange={(e) => setEditObservacoes(e.target.value)}
                      className="w-full p-3 bg-slate-950 border border-indigo-500 rounded-xl text-white outline-none"
                    />
                  )}
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-slate-400 font-semibold">Tags</label>
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    {selectedExamForDetail.tags.map((t, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-xl bg-slate-800 text-indigo-300 font-mono text-[11px] border border-slate-700">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => {
                    if (window.confirm('Excluir esta prova do banco?')) {
                      deleteExam(selectedExamForDetail.id);
                      setIsDetailModalOpen(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold hover:bg-rose-500/30 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Excluir Prova</span>
                </button>

                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
