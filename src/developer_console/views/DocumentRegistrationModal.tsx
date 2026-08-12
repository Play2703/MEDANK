/**
 * Developer Console - DocumentRegistrationModal Component
 *
 * Registration modal for entering metadata during multi-file import into MedAnki Knowledge Library.
 * Supports multi-selection for specialties and tags.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  FileText,
  Upload,
  Plus,
  Tag,
  Check,
  Building2,
  User,
  BookOpen,
  FolderPlus,
  Info,
  Calendar,
  Globe,
  Trash2,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import {
  FileImportPayload,
  KnowledgeCategory,
  KNOWLEDGE_CATEGORIES,
} from '../../core/knowledge_library';

interface DocumentRegistrationModalProps {
  isOpen: boolean;
  stagedFiles: FileImportPayload[];
  specialtiesCatalog: { id: string; name: string }[];
  disciplinesCatalog: { id: string; name: string }[];
  onClose: () => void;
  onUpdateFile: (index: number, partial: Partial<FileImportPayload>) => void;
  onRemoveFile: (index: number) => void;
  onConfirmRegistration: () => void;
}

export const DocumentRegistrationModal: React.FC<DocumentRegistrationModalProps> = ({
  isOpen,
  stagedFiles,
  specialtiesCatalog,
  disciplinesCatalog,
  onClose,
  onUpdateFile,
  onRemoveFile,
  onConfirmRegistration,
}) => {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [customTagInput, setCustomTagInput] = useState<string>('');

  if (!isOpen || stagedFiles.length === 0) return null;

  const currentFile = stagedFiles[activeIndex] || stagedFiles[0];

  const handleAddTag = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    e.preventDefault();
    if (!customTagInput.trim()) return;

    const existingTags = currentFile.tags || [];
    if (!existingTags.includes(customTagInput.trim())) {
      onUpdateFile(activeIndex, { tags: [...existingTags, customTagInput.trim()] });
    }
    setCustomTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const existingTags = currentFile.tags || [];
    onUpdateFile(activeIndex, { tags: existingTags.filter((t) => t !== tagToRemove) });
  };

  const handleToggleSpecialty = (specName: string) => {
    const currentSpecs = currentFile.specialties || [];
    if (currentSpecs.includes(specName)) {
      if (currentSpecs.length === 1) return; // Keep at least one
      onUpdateFile(activeIndex, { specialties: currentSpecs.filter((s) => s !== specName) });
    } else {
      onUpdateFile(activeIndex, { specialties: [...currentSpecs, specName] });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-slate-100"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Cadastro de Conteúdo Médico</span>
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Status: Importado
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Preencha os metadados bibliográficos para registro no acervo do MedCore ({stagedFiles.length} {stagedFiles.length === 1 ? 'arquivo' : 'arquivos'}).
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* File Selector Sidebar for Batch */}
          {stagedFiles.length > 1 && (
            <div className="w-full md:w-64 bg-slate-950/60 border-b md:border-b-0 md:border-r border-slate-800 p-3 space-y-2 overflow-y-auto">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2 block">
                Arquivos para Importar ({stagedFiles.length})
              </span>
              <div className="space-y-1">
                {stagedFiles.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveIndex(idx)}
                    className={`w-full text-left p-2.5 rounded-2xl text-xs flex items-center justify-between gap-2 transition-all border ${
                      activeIndex === idx
                        ? 'bg-indigo-600/20 text-indigo-200 border-indigo-500/40 font-semibold'
                        : 'bg-slate-900/50 text-slate-400 border-slate-800/80 hover:bg-slate-800'
                    }`}
                  >
                    <div className="truncate flex items-center gap-2">
                      <FileText className="w-4 h-4 shrink-0 text-indigo-400" />
                      <span className="truncate">{item.overrideName || item.file.name}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveFile(idx);
                        if (activeIndex >= stagedFiles.length - 1) {
                          setActiveIndex(Math.max(0, stagedFiles.length - 2));
                        }
                      }}
                      className="text-slate-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Metadata Form */}
          <div className="flex-1 p-6 overflow-y-auto space-y-5">
            {/* File Info Bar */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2 truncate">
                <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="font-mono text-slate-200 truncate">{currentFile.file.name}</span>
              </div>
              <span className="font-mono bg-slate-800 px-2 py-1 rounded-lg text-[10px] text-slate-300">
                {(currentFile.file.size / (1024 * 1024)).toFixed(2)} MB
              </span>
            </div>

            {/* Grid 1: Name & Type */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-slate-300">Nome do Documento *</label>
                <input
                  type="text"
                  value={currentFile.overrideName || ''}
                  onChange={(e) => onUpdateFile(activeIndex, { overrideName: e.target.value })}
                  placeholder="Ex: Tratado de Cardiologia Braunwald"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Tipo de Conteúdo *</label>
                <select
                  value={currentFile.category || 'Outro'}
                  onChange={(e) =>
                    onUpdateFile(activeIndex, { category: e.target.value as KnowledgeCategory })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs outline-none focus:border-indigo-500 transition-colors"
                >
                  {KNOWLEDGE_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Grid 2: Multi-Select Especialidade */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Especialidades Médicas (Seleção Múltipla) *</span>
                <span className="text-[10px] text-indigo-400 font-normal">
                  Selecione uma ou mais especialidades
                </span>
              </label>
              <div className="flex items-center gap-1.5 flex-wrap max-h-28 overflow-y-auto p-2 bg-slate-950 border border-slate-800 rounded-2xl">
                {specialtiesCatalog.map((spec) => {
                  const isSelected = (currentFile.specialties || []).includes(spec.name);
                  return (
                    <button
                      key={spec.id}
                      type="button"
                      onClick={() => handleToggleSpecialty(spec.name)}
                      className={`px-3 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1 border ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                      <span>{spec.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Grid 3: Disciplina, Assunto, Subtema */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Disciplina</label>
                <select
                  value={currentFile.discipline || 'Geral'}
                  onChange={(e) => onUpdateFile(activeIndex, { discipline: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs outline-none focus:border-indigo-500 transition-colors"
                >
                  {disciplinesCatalog.map((disc) => (
                    <option key={disc.id} value={disc.name}>
                      {disc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Assunto Principais</label>
                <input
                  type="text"
                  value={currentFile.subject || ''}
                  onChange={(e) => onUpdateFile(activeIndex, { subject: e.target.value })}
                  placeholder="Ex: Insuficiência Cardíaca"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Subtema / Tópico</label>
                <input
                  type="text"
                  value={currentFile.subtopic || ''}
                  onChange={(e) => onUpdateFile(activeIndex, { subtopic: e.target.value })}
                  placeholder="Ex: IAM com Supra ST"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            {/* Grid 4: Autor, Instituição, Ano, Idioma */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Autor / Professor</label>
                <input
                  type="text"
                  value={currentFile.author || ''}
                  onChange={(e) => onUpdateFile(activeIndex, { author: e.target.value })}
                  placeholder="Ex: Dr. Eugene Braunwald"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Instituição / Banca</label>
                <input
                  type="text"
                  value={currentFile.institution || ''}
                  onChange={(e) => onUpdateFile(activeIndex, { institution: e.target.value })}
                  placeholder="Ex: ENARE / USP / SBC"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Ano</label>
                <input
                  type="number"
                  value={currentFile.year || new Date().getFullYear()}
                  onChange={(e) =>
                    onUpdateFile(activeIndex, { year: parseInt(e.target.value, 10) || 2026 })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Idioma</label>
                <select
                  value={currentFile.language || 'pt-BR'}
                  onChange={(e) => onUpdateFile(activeIndex, { language: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="pt-BR">Português (pt-BR)</option>
                  <option value="en-US">Inglês (en-US)</option>
                  <option value="es-ES">Espanhol (es-ES)</option>
                </select>
              </div>
            </div>

            {/* Grid 5: Multi-Select Tags */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Tags e Palavras-chave (Seleção Múltipla)</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Tag className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={customTagInput}
                    onChange={(e) => setCustomTagInput(e.target.value)}
                    onKeyDown={handleAddTag}
                    placeholder="Digite a tag e pressione Enter (ex: Cardiologia, Prova, ENARE)..."
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="px-3.5 py-2.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-xs font-semibold transition-colors flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar</span>
                </button>
              </div>

              {/* Added Tags Chips */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {(currentFile.tags || []).map((t, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-medium flex items-center gap-1.5"
                  >
                    <span>#{t}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="text-indigo-400 hover:text-indigo-100"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Grid 6: Descrição, Observações, Origem */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Descrição / Resumo</label>
                <textarea
                  rows={2}
                  value={currentFile.description || ''}
                  onChange={(e) => onUpdateFile(activeIndex, { description: e.target.value })}
                  placeholder="Breve resumo ou contexto do documento..."
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs outline-none focus:border-indigo-500 transition-colors resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Observações & Origem</label>
                <textarea
                  rows={2}
                  value={currentFile.notes || ''}
                  onChange={(e) => onUpdateFile(activeIndex, { notes: e.target.value })}
                  placeholder="Observações administrativas ou origem do arquivo..."
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs outline-none focus:border-indigo-500 transition-colors resize-none"
                />
              </div>
            </div>

            {/* Grid 7: Conteúdo do Documento */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Conteúdo do Documento (texto completo para Grafo NER)</span>
                <span className="text-[10px] text-indigo-400 font-mono">Alimenta RAG & Grafo NER</span>
              </label>
              <textarea
                rows={4}
                value={currentFile.extractedText || ''}
                onChange={(e) => onUpdateFile(activeIndex, { extractedText: e.target.value })}
                placeholder="Cole o texto extraído do documento para processamento no Grafo de Conhecimento..."
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs outline-none focus:border-indigo-500 font-mono leading-relaxed"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {stagedFiles.length > 1 && (
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <button
                  disabled={activeIndex === 0}
                  onClick={() => setActiveIndex(activeIndex - 1)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono text-xs text-slate-300 px-2">
                  {activeIndex + 1} de {stagedFiles.length}
                </span>
                <button
                  disabled={activeIndex === stagedFiles.length - 1}
                  onClick={() => setActiveIndex(activeIndex + 1)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirmRegistration}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Concluir Registro ({stagedFiles.length})</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
