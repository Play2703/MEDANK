/**
 * Developer Console - GuidelinesView Component (Phase 18.6)
 *
 * Complete CRUD & management for Guidelines (Diretrizes) with AMB, SBM, SBC, FEBRASGO, SBI, CFM, MS, OMS categories.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileCheck,
  Search,
  Plus,
  Edit3,
  Trash2,
  FileText,
  Calendar,
  Award,
  X,
  Check,
  Building2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useGuidelineViewModel } from '../../core/guidelines';
import { GuidelineModel, GuidelineCreateDTO, GuidelineCategory } from '../../core/guidelines/models/GuidelineModel';

export const GuidelinesView: React.FC = () => {
  const {
    guidelines,
    allCount,
    searchTerm,
    setSearchTerm,
    selectedCategory,
    setSelectedCategory,
    categories,
    addGuideline,
    updateGuideline,
    deleteGuideline,
    totalStorageFormatted,
  } = useGuidelineViewModel();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GuidelineModel | null>(null);

  // Form states
  const [titulo, setTitulo] = useState('');
  const [categoria, setCategoria] = useState<GuidelineCategory>('SBC');
  const [ano, setAno] = useState(new Date().getFullYear());
  const [especialidade, setEspecialidade] = useState('');
  const [resumo, setResumo] = useState('');
  const [conteudoTexto, setConteudoTexto] = useState('');
  const [arquivo, setArquivo] = useState('');

  const handleOpenAdd = () => {
    setEditingItem(null);
    setTitulo('');
    setCategoria('SBC');
    setAno(new Date().getFullYear());
    setEspecialidade('');
    setResumo('');
    setConteudoTexto('');
    setArquivo('diretriz_oficial.pdf');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: GuidelineModel) => {
    setEditingItem(item);
    setTitulo(item.titulo);
    setCategoria(item.categoria);
    setAno(item.ano);
    setEspecialidade(item.especialidade);
    setResumo(item.resumo);
    setConteudoTexto(item.conteudoTexto || '');
    setArquivo(item.arquivo);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !resumo.trim()) return;

    const dto: GuidelineCreateDTO = {
      titulo,
      categoria,
      ano,
      especialidade,
      resumo,
      conteudoTexto: conteudoTexto.trim() || undefined,
      arquivo: arquivo || 'diretriz_oficial.pdf',
    };

    if (editingItem) {
      updateGuideline(editingItem.id, dto);
    } else {
      addGuideline(dto);
    }

    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-teal-950 via-slate-900 to-slate-950 border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-xl bg-teal-500/20 text-teal-300 font-mono text-xs font-bold border border-teal-500/30">
              Fase 18.6
            </span>
            <span className="text-xs text-slate-400 font-medium">Repositório Oficial de Diretrizes Médicas</span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
            <FileCheck className="w-7 h-7 text-teal-400" />
            <span>Módulo de Diretrizes</span>
          </h2>
          <p className="text-xs text-slate-400 max-w-xl">
            Gerenciamento e consulta de diretrizes clínicas institucionais (AMB, SBM, SBC, FEBRASGO, SBI, CFM, MS, OMS) com persistência local.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-2xl bg-slate-900/90 border border-slate-800 text-right">
            <p className="text-[10px] text-slate-400 font-mono">Total de Diretrizes</p>
            <p className="text-sm font-bold text-teal-400 font-mono">{allCount} cadastradas ({totalStorageFormatted})</p>
          </div>

          <button
            onClick={handleOpenAdd}
            className="px-5 py-3 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-lg shadow-teal-600/30 flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Diretriz</span>
          </button>
        </div>
      </div>

      {/* Search & Categories Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por título, especialidade ou resumo..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-white outline-none focus:border-teal-500 shadow-sm"
          />
        </div>

        {/* Categories Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30 font-bold'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Guidelines Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {guidelines.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col justify-between gap-4 group hover:border-teal-500/50 transition-all"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-xl bg-teal-500/15 text-teal-300 font-mono text-[10px] font-bold border border-teal-500/30">
                    {item.categoria}
                  </span>
                  <span className="px-2.5 py-1 rounded-xl bg-slate-800 text-slate-300 font-mono text-[10px] border border-slate-700">
                    {item.especialidade}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800">
                  {item.ano}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-black text-white group-hover:text-teal-300 transition-colors">
                  {item.titulo}
                </h3>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
                  {item.resumo}
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-slate-400 font-mono">
                <div className="flex items-center gap-1.5 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span className="truncate">{item.arquivo}</span>
                </div>
                {item.conteudoTexto && item.conteudoTexto.trim().length > 30 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-mono border border-emerald-500/30 shrink-0">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    Grafo (NER)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/30 shrink-0">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    Não indexado
                  </span>
                )}
              </div>
            </div>

            {/* Actions footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
              <span className="text-[10px] font-mono text-slate-500">Instituição: {item.categoria}</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleOpenEdit(item)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Editar"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Deseja excluir a diretriz "${item.titulo}"?`)) {
                      deleteGuideline(item.id);
                    }
                  }}
                  className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 transition-colors"
                  title="Excluir"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}

        {guidelines.length === 0 && (
          <div className="col-span-full py-16 text-center space-y-3 bg-slate-900/50 rounded-3xl border border-slate-800">
            <FileCheck className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-400">Nenhuma diretriz encontrada</p>
            <p className="text-xs text-slate-500">Tente buscar por outro termo ou cadastre uma nova diretriz.</p>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5 text-slate-100 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
                    <FileCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {editingItem ? 'Editar Diretriz Médica' : 'Cadastrar Nova Diretriz'}
                    </h3>
                    <p className="text-xs text-slate-400">Insira os dados e instituição oficial responsável.</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Título da Diretriz *</label>
                  <input
                    type="text"
                    required
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="Ex: Diretrizes Brasileiras de Hipertensão..."
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-teal-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-semibold">Categoria / Órgão</label>
                    <select
                      value={categoria}
                      onChange={(e) => setCategoria(e.target.value as GuidelineCategory)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-teal-500"
                    >
                      <option value="AMB">AMB</option>
                      <option value="SBM">SBM</option>
                      <option value="SBC">SBC</option>
                      <option value="FEBRASGO">FEBRASGO</option>
                      <option value="SBI">SBI</option>
                      <option value="CFM">CFM</option>
                      <option value="MS">MS</option>
                      <option value="OMS">OMS</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-semibold">Ano</label>
                    <input
                      type="number"
                      value={ano}
                      onChange={(e) => setAno(parseInt(e.target.value, 10) || 2026)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-teal-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-semibold">Especialidade</label>
                    <input
                      type="text"
                      value={especialidade}
                      onChange={(e) => setEspecialidade(e.target.value)}
                      placeholder="Ex: Cardiologia"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-teal-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Resumo Executivo *</label>
                  <textarea
                    rows={4}
                    required
                    value={resumo}
                    onChange={(e) => setResumo(e.target.value)}
                    placeholder="Resumo das recomendações, critérios e pontos fundamentais..."
                    className="w-full p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-teal-500 leading-relaxed"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold flex items-center justify-between">
                    <span>Conteúdo Completo da Diretriz (opcional)</span>
                    <span className="text-[10px] text-teal-400 font-mono">Alimenta RAG & Grafo NER</span>
                  </label>
                  <textarea
                    rows={5}
                    value={conteudoTexto}
                    onChange={(e) => setConteudoTexto(e.target.value)}
                    placeholder="Cole o texto completo da diretriz para extração automática de CIDs, entidades médicas e relações no Grafo..."
                    className="w-full p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-teal-500 leading-relaxed font-mono text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Nome do Arquivo (PDF)</label>
                  <input
                    type="text"
                    value={arquivo}
                    onChange={(e) => setArquivo(e.target.value)}
                    placeholder="Ex: diretriz_sbc.pdf"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-teal-500 font-mono"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-lg shadow-teal-600/30"
                  >
                    {editingItem ? 'Salvar Alterações' : 'Cadastrar Diretriz'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
