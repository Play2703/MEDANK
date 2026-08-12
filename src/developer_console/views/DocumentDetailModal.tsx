/**
 * Developer Console - DocumentDetailModal Component
 *
 * Detailed view overlay for a Knowledge Library item displaying all metadata,
 * allowing editing, tag updates, category moving, duplication, deletion,
 * and presenting non-functional architecture placeholders for future pipeline stages.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  FileText,
  Calendar,
  User,
  Building2,
  Tag,
  FolderSync,
  Copy,
  Trash2,
  Edit3,
  Check,
  Cpu,
  Sparkles,
  Brain,
  Bot,
  FileSearch,
  HardDrive,
  Info,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import {
  KnowledgeLibraryItem,
  KnowledgeCategory,
  KNOWLEDGE_CATEGORIES,
} from '../../core/knowledge_library';

interface DocumentDetailModalProps {
  isOpen: boolean;
  item: KnowledgeLibraryItem | null;
  onClose: () => void;
  onUpdateMetadata: (id: string, updates: Partial<KnowledgeLibraryItem>) => void;
  onMoveCategory: (id: string, newCategory: KnowledgeCategory) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export const DocumentDetailModal: React.FC<DocumentDetailModalProps> = ({
  isOpen,
  item,
  onClose,
  onUpdateMetadata,
  onMoveCategory,
  onDuplicate,
  onDelete,
}) => {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editedName, setEditedName] = useState<string>('');
  const [editedAuthor, setEditedAuthor] = useState<string>('');
  const [editedInstitution, setEditedInstitution] = useState<string>('');
  const [editedDiscipline, setEditedDiscipline] = useState<string>('');
  const [editedSubject, setEditedSubject] = useState<string>('');
  const [editedDescription, setEditedDescription] = useState<string>('');
  const [newTagInput, setNewTagInput] = useState<string>('');

  if (!isOpen || !item) return null;

  const startEdit = () => {
    setEditedName(item.name);
    setEditedAuthor(item.author || '');
    setEditedInstitution(item.institution || '');
    setEditedDiscipline(item.discipline);
    setEditedSubject(item.subject);
    setEditedDescription(item.description || '');
    setIsEditing(true);
  };

  const saveEdit = () => {
    onUpdateMetadata(item.id, {
      name: editedName,
      author: editedAuthor,
      institution: editedInstitution,
      discipline: editedDiscipline,
      subject: editedSubject,
      description: editedDescription,
    });
    setIsEditing(false);
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && newTagInput.trim()) {
      e.preventDefault();
      if (!item.tags.includes(newTagInput.trim())) {
        onUpdateMetadata(item.id, { tags: [...item.tags, newTagInput.trim()] });
      }
      setNewTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onUpdateMetadata(item.id, { tags: item.tags.filter((t) => t !== tagToRemove) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-slate-100"
      >
        {/* Top Bar */}
        <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-md bg-slate-800 text-indigo-300 font-bold border border-slate-700">
                  {item.format}
                </span>
                <span className="text-xs font-semibold text-slate-400">• Category: {item.type}</span>
              </div>
              <h2 className="text-base font-bold text-white truncate max-w-md">{item.name}</h2>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <button
                onClick={startEdit}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Editar Metadados</span>
              </button>
            ) : (
              <button
                onClick={saveEdit}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition-colors flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Salvar Alterações</span>
              </button>
            )}

            <button
              onClick={() => onDuplicate(item.id)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Duplicar Cadastro"
            >
              <Copy className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                if (window.confirm('Tem certeza que deseja excluir este documento da biblioteca?')) {
                  onDelete(item.id);
                }
              }}
              className="p-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition-colors"
              title="Excluir Documento"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Modal Content */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {/* Status Badge & Key Information Card */}
          <div className="p-4 rounded-3xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Status: {item.status}</span>
              </div>
              <span className="text-xs text-slate-400 font-mono">ID: {item.id}</span>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-400">
              <div>
                <span>Tamanho: </span>
                <strong className="text-slate-200">{item.fileSizeFormatted}</strong>
              </div>
              <div>
                <span>Data de Importação: </span>
                <strong className="text-slate-200">
                  {new Date(item.importDate).toLocaleDateString('pt-BR')}
                </strong>
              </div>
            </div>
          </div>

          {/* Main Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Bibliographic Details */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                Informações Bibliográficas
              </h3>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">Nome do Arquivo Original</span>
                  <span className="font-mono text-slate-200 font-medium">{item.fileName}</span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[11px]">Especialidades Médicas</span>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    {item.specialties.map((spec, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 font-medium border border-indigo-500/30 text-[11px]"
                      >
                        {spec}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Disciplina</span>
                    {!isEditing ? (
                      <span className="text-slate-200 font-medium">{item.discipline}</span>
                    ) : (
                      <input
                        type="text"
                        value={editedDiscipline}
                        onChange={(e) => setEditedDiscipline(e.target.value)}
                        className="w-full px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs"
                      />
                    )}
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[11px]">Assunto Principal</span>
                    {!isEditing ? (
                      <span className="text-slate-200 font-medium">{item.subject}</span>
                    ) : (
                      <input
                        type="text"
                        value={editedSubject}
                        onChange={(e) => setEditedSubject(e.target.value)}
                        className="w-full px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs"
                      />
                    )}
                  </div>
                </div>

                {item.subtopic && (
                  <div>
                    <span className="text-slate-500 block text-[11px]">Subtema</span>
                    <span className="text-slate-200 font-medium">{item.subtopic}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Autor / Professor</span>
                    {!isEditing ? (
                      <span className="text-slate-200 font-medium">{item.author || '—'}</span>
                    ) : (
                      <input
                        type="text"
                        value={editedAuthor}
                        onChange={(e) => setEditedAuthor(e.target.value)}
                        className="w-full px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs"
                      />
                    )}
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[11px]">Instituição / Banca</span>
                    {!isEditing ? (
                      <span className="text-slate-200 font-medium">{item.institution || '—'}</span>
                    ) : (
                      <input
                        type="text"
                        value={editedInstitution}
                        onChange={(e) => setEditedInstitution(e.target.value)}
                        className="w-full px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-white text-xs"
                      />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Ano de Publicação</span>
                    <span className="text-slate-200 font-medium">{item.year || '—'}</span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[11px]">Idioma</span>
                    <span className="text-slate-200 font-medium">{item.language}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Tags, Category Move & Description */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                Ações de Organização & Tags
              </h3>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 text-xs">
                {/* Category Selector */}
                <div>
                  <label className="text-slate-400 font-medium block text-[11px] mb-1">
                    Mover para Categoria
                  </label>
                  <select
                    value={item.type}
                    onChange={(e) => onMoveCategory(item.id, e.target.value as KnowledgeCategory)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs outline-none focus:border-indigo-500"
                  >
                    {KNOWLEDGE_CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tags Management */}
                <div className="space-y-2">
                  <label className="text-slate-400 font-medium block text-[11px]">
                    Tags e Palavras-Chave (Pressione Enter)
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {item.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium flex items-center gap-1 border border-slate-700"
                      >
                        <span>#{tag}</span>
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="text-slate-400 hover:text-rose-400 ml-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={handleAddTag}
                    placeholder="Adicionar nova tag..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs outline-none focus:border-indigo-500 mt-2"
                  />
                </div>

                {/* Description */}
                <div>
                  <span className="text-slate-400 block text-[11px] mb-1">Descrição / Observações</span>
                  {!isEditing ? (
                    <p className="text-slate-300 text-xs leading-relaxed italic bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                      {item.description || 'Nenhuma descrição fornecida.'}
                    </p>
                  ) : (
                    <textarea
                      rows={3}
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      className="w-full p-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Architecture Preparation Notice & Future Pipeline Modules */}
          <div className="p-5 rounded-3xl bg-indigo-950/20 border border-indigo-500/20 space-y-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-400 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-white">Preparação de Arquitetura Futura</h4>
                <p className="text-[11px] text-indigo-200/80">
                  Estruturas reservadas na biblioteca para acoplamento com futuros pipelines automatizados de processamento.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 pt-1">
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                <div className="text-[10px] font-bold text-indigo-300 flex items-center gap-1">
                  <FileSearch className="w-3.5 h-3.5" />
                  <span>Vision OCR</span>
                </div>
                <span className="text-[9px] text-slate-500 font-mono block">Aguardando Fase</span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                <div className="text-[10px] font-bold text-indigo-300 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Parser Médico</span>
                </div>
                <span className="text-[9px] text-slate-500 font-mono block">Aguardando Fase</span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                <div className="text-[10px] font-bold text-indigo-300 flex items-center gap-1">
                  <Brain className="w-3.5 h-3.5" />
                  <span>Embeddings</span>
                </div>
                <span className="text-[9px] text-slate-500 font-mono block">Aguardando Fase</span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                <div className="text-[10px] font-bold text-indigo-300 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Knowledge Graph</span>
                </div>
                <span className="text-[9px] text-slate-500 font-mono block">Aguardando Fase</span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-1">
                <div className="text-[10px] font-bold text-indigo-300 flex items-center gap-1">
                  <Bot className="w-3.5 h-3.5" />
                  <span>Síntese IA</span>
                </div>
                <span className="text-[9px] text-slate-500 font-mono block">Aguardando Fase</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
          >
            Fechar Visualização
          </button>
        </div>
      </motion.div>
    </div>
  );
};
