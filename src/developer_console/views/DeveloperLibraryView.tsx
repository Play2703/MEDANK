/**
 * Developer Console - DeveloperLibraryView Component (Phase 18.1 & 18.2)
 *
 * Biblioteca do MedCore - Central repository for MedAnki materials.
 * Fully functional file upload (PDF, DOCX, PPTX, TXT, MD, EPUB), multi-file support,
 * native file picker, progress bar, success/error indicators, search, sort, filter,
 * edit, delete, and Material 3 dark premium interface.
 */

import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Plus,
  Upload,
  RefreshCw,
  FolderOpen,
  FileText,
  BookOpen,
  Layers,
  HardDrive,
  FileCheck,
  Eye,
  Trash2,
  Copy,
  Grid,
  List as ListIcon,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Tag,
  ArrowUpDown,
  Filter,
} from 'lucide-react';
import { useMaterialViewModel } from '../../core/material';
import { MaterialModel } from '../../core/material';
import { KnowledgeCategory, KnowledgeCategoryMapper } from '../../core/knowledge_library/models/KnowledgeCategory';
import { DocumentViewerModal } from './DocumentViewerModal';

export const DeveloperLibraryView: React.FC = () => {
  const {
    materials,
    allMaterialsCount,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    selectedSpecialty,
    setSelectedSpecialty,
    selectedDiscipline,
    setSelectedDiscipline,
    selectedFormat,
    setSelectedFormat,
    sortBy,
    setSortBy,
    // Import & Upload
    isImportModalOpen,
    setIsImportModalOpen,
    stagedFiles,
    stageFiles,
    confirmUploadStagedFiles,
    uploadProgress,
    uploadStatus,
    uploadMessage,
    // Detail modal
    isDetailModalOpen,
    setIsDetailModalOpen,
    selectedItemForDetail,
    setSelectedItemForDetail,
    // Actions
    updateMaterialDetails,
    deleteMaterial,
    resetToSeed,
    stats,
  } = useMaterialViewModel();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');

  // Edit inline state for detail modal
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editTitulo, setEditTitulo] = useState<string>('');
  const [editAutor, setEditAutor] = useState<string>('');
  const [editCategoria, setEditCategoria] = useState<KnowledgeCategory>(KnowledgeCategory.book);
  const [editDisciplina, setEditDisciplina] = useState<string>('');
  const [editEspecialidade, setEditEspecialidade] = useState<string>('');
  const [editAno, setEditAno] = useState<number>(2026);
  const [editDescricao, setEditDescricao] = useState<string>('');
  const [editObservacoes, setEditObservacoes] = useState<string>('');

  const handleFileSelectChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      stageFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openNativeFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const openDetailModal = (item: MaterialModel) => {
    setSelectedItemForDetail(item);
    setEditTitulo(item.titulo);
    setEditAutor(item.autor);
    setEditCategoria(item.categoria);
    setEditDisciplina(item.disciplina);
    setEditEspecialidade(item.especialidade);
    setEditAno(item.ano);
    setEditDescricao(item.descricao);
    setEditObservacoes(item.observacoes);
    setIsEditing(false);
    setIsDetailModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedItemForDetail) return;
    await updateMaterialDetails(selectedItemForDetail.id, {
      titulo: editTitulo,
      autor: editAutor,
      categoria: editCategoria,
      disciplina: editDisciplina,
      especialidade: editEspecialidade,
      ano: editAno,
      descricao: editDescricao,
      observacoes: editObservacoes,
    });
    setIsEditing(false);
    const updated = {
      ...selectedItemForDetail,
      titulo: editTitulo,
      autor: editAutor,
      categoria: editCategoria,
      disciplina: editDisciplina,
      especialidade: editEspecialidade,
      ano: editAno,
      descricao: editDescricao,
      observacoes: editObservacoes,
    };
    setSelectedItemForDetail(updated);
  };

  const categoriesList = ['Todas', 'Livros', 'Provas', 'Diretrizes', 'Artigos', 'Apostilas', 'Protocolos'];

  return (
    <div className="w-full space-y-6 text-slate-100">
      {/* Native Hidden Multi-File Picker (Phase 18.2) */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.md,.epub"
        onChange={handleFileSelectChange}
        className="hidden"
      />

      {/* Top Banner & Header */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold shadow-inner">
              <FolderOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-white">Biblioteca do MedCore</h1>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold">
                  Fase 18.1 & 18.2
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Repositório central de materiais, livros, provas e diretrizes para alimentação da IA e flashcards.
              </p>
            </div>
          </div>
        </div>

        {/* Primary CTA Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => resetToSeed()}
            className="px-3.5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors flex items-center gap-2 border border-slate-700"
            title="Restaurar Dados Demonstrativos"
          >
            <RefreshCw className="w-4 h-4 text-slate-400" />
            <span className="hidden sm:inline">Restaurar Padrão</span>
          </button>

          <button
            onClick={openNativeFilePicker}
            className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2.5 transform active:scale-95"
          >
            <Upload className="w-4 h-4" />
            <span>Novo Material / Upload</span>
          </button>
        </div>
      </div>

      {/* Statistical Cards Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Total de Materiais
            </span>
            <div className="text-2xl font-black text-white">{stats.totalItems}</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Volume de Dados
            </span>
            <div className="text-2xl font-black text-white">{stats.totalSizeFormatted}</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <HardDrive className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Status Importado
            </span>
            <div className="text-2xl font-black text-emerald-400">
              {materials.filter((m) => m.status === 'Importado').length}
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <FileCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Categorias Ativas
            </span>
            <div className="text-2xl font-black text-indigo-400">{stats.categoriesCount}</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Layers className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="p-1.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        {categoriesList.map((cat) => {
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>{cat === 'Todas' ? '🌐' : '📁'}</span>
              <span>{cat}</span>
            </button>
          );
        })}
      </div>

      {/* Filter, Search & Sort Toolbar */}
      <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar por título, autor, disciplina, especialidade ou tags..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-white outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Dropdowns & View Mode */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Formato Filter */}
          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 outline-none focus:border-indigo-500"
          >
            <option value="Todos">Todos Formatos</option>
            <option value="PDF">PDF</option>
            <option value="DOCX">DOCX</option>
            <option value="PPTX">PPTX</option>
            <option value="EPUB">EPUB</option>
            <option value="TXT">TXT</option>
            <option value="MD">MD</option>
          </select>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 outline-none focus:border-indigo-500"
          >
            <option value="date">Ordenar: Mais Recentes</option>
            <option value="title">Ordenar: Título (A-Z)</option>
            <option value="size">Ordenar: Tamanho do Arquivo</option>
          </select>

          {/* Toggle View Mode */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                viewMode === 'table' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Visualização em Tabela"
            >
              <ListIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs transition-colors ${
                viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
              title="Visualização em Grid"
            >
              <Grid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Carregando materiais do MedCore...</p>
        </div>
      ) : error ? (
        <div className="p-8 rounded-3xl bg-rose-950/20 border border-rose-500/30 text-center space-y-2">
          <XCircle className="w-8 h-8 text-rose-400 mx-auto" />
          <h3 className="text-sm font-bold text-white">Erro ao carregar acervo</h3>
          <p className="text-xs text-rose-200">{error}</p>
        </div>
      ) : materials.length === 0 ? (
        <div className="p-12 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto">
            <BookOpen className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Nenhum Material Encontrado</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Nenhum documento corresponde aos filtros ou à pesquisa atual. Clique em "Novo Material / Upload" para adicionar arquivos.
            </p>
          </div>
          <button
            onClick={openNativeFilePicker}
            className="px-5 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 inline-flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            <span>Fazer Upload de Arquivo</span>
          </button>
        </div>
      ) : viewMode === 'table' ? (
        <div className="rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider font-bold border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4">Título / Arquivo</th>
                  <th className="px-4 py-4">Categoria / Tipo</th>
                  <th className="px-4 py-4">Disciplina / Especialidade</th>
                  <th className="px-4 py-4">Autor / Ano</th>
                  <th className="px-4 py-4">Tamanho</th>
                  <th className="px-4 py-4">Origem</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {materials.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => openDetailModal(item)}
                    className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-1 rounded-md bg-slate-800 text-indigo-300 font-mono text-[10px] font-bold border border-slate-700">
                          {item.formato}
                        </span>
                        <div>
                          <span className="font-bold text-white block truncate max-w-xs">
                            {item.titulo}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">{item.nomeArquivo}</span>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <div className="space-y-0.5">
                        <span className="font-semibold text-slate-200 block">{KnowledgeCategoryMapper.toDisplayName(item.categoria)}</span>
                        <span className="text-slate-500 text-[10px]">{item.tipo}</span>
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <div className="space-y-0.5">
                        <span className="text-slate-300 block">{item.especialidade}</span>
                        <span className="text-slate-500 text-[10px]">{item.disciplina}</span>
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <div className="space-y-0.5">
                        <span className="text-slate-300 block truncate max-w-[140px]">{item.autor}</span>
                        <span className="text-slate-500 text-[10px]">{item.ano}</span>
                      </div>
                    </td>

                    <td className="px-4 py-4 font-mono text-slate-400 text-[11px]">
                      {item.tamanhoFormatado}
                    </td>

                    <td className="px-4 py-4">
                      {item.conteudoTexto && item.conteudoTexto.trim().length > 30 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-mono border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          Grafo (NER)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/30">
                          Não indexado
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openDetailModal(item)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                          title="Detalhes / Editar"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm('Tem certeza que deseja excluir este material?')) {
                              deleteMaterial(item.id);
                            }
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {materials.map((item) => (
            <div
              key={item.id}
              onClick={() => openDetailModal(item)}
              className="p-5 rounded-3xl bg-slate-900 border border-slate-800 hover:border-indigo-500/40 cursor-pointer transition-all space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-xl bg-slate-800 text-indigo-300 font-mono text-[10px] font-bold border border-slate-700">
                    {item.formato}
                  </span>
                  {item.conteudoTexto && item.conteudoTexto.trim().length > 30 ? (
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

                <h4 className="text-sm font-bold text-white line-clamp-2">{item.titulo}</h4>
                <p className="text-xs text-slate-400 line-clamp-2">{item.descricao}</p>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
                <span className="truncate max-w-[140px]">{item.especialidade}</span>
                <span className="font-mono text-[11px]">{item.tamanhoFormatado}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Progress & Confirmation Modal (Phase 18.2) */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5 text-slate-100"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-white">Upload de Arquivos MedCore</h3>
                    <p className="text-xs text-slate-400">{stagedFiles.length} arquivo(s) selecionado(s)</p>
                  </div>
                </div>

                {uploadStatus !== 'uploading' && (
                  <button
                    onClick={() => setIsImportModalOpen(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Staged files list */}
              <div className="max-h-40 overflow-y-auto space-y-2 p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
                {stagedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2 py-1 border-b border-slate-800/50 last:border-0">
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span className="text-slate-200 truncate">{file.name}</span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                ))}
              </div>

              {/* Progress bar & indicators */}
              {uploadStatus !== 'idle' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-300">
                      {uploadStatus === 'uploading' && 'Salvando no armazenamento interno...'}
                      {uploadStatus === 'success' && 'Upload concluído com sucesso!'}
                      {uploadStatus === 'error' && 'Falha no upload.'}
                    </span>
                    <span className="font-mono font-bold text-indigo-400">{uploadProgress}%</span>
                  </div>

                  <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                    <motion.div
                      className={`h-full ${
                        uploadStatus === 'success'
                          ? 'bg-emerald-500'
                          : uploadStatus === 'error'
                          ? 'bg-rose-500'
                          : 'bg-indigo-600'
                      }`}
                      style={{ width: `${uploadProgress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>

                  {uploadMessage && (
                    <p
                      className={`text-xs p-2.5 rounded-xl ${
                        uploadStatus === 'success'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : uploadStatus === 'error'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-indigo-500/15 text-indigo-200 border border-indigo-500/30'
                      }`}
                    >
                      {uploadMessage}
                    </p>
                  )}
                </div>
              )}

              {/* Actions */}
              {uploadStatus === 'idle' && (
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => setIsImportModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => confirmUploadStagedFiles([])}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Confirmar Upload de {stagedFiles.length} Arquivo(s)</span>
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Internal Document Viewer Modal (Phase 18.3) */}
      <DocumentViewerModal
        material={selectedItemForDetail}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onDelete={(id) => deleteMaterial(id)}
        onUpdate={(id, dto) => updateMaterialDetails(id, dto)}
      />
    </div>
  );
};
