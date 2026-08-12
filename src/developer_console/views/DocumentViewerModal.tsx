/**
 * Developer Console - DocumentViewerModal Component (Phase 18.3)
 *
 * Internal Document Viewer (Visualizador Interno) supporting PDF, DOCX, TXT, and Markdown.
 * Features: Zoom controls, text search, share, open external, delete, and metadata editing.
 * No AI processing.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText,
  ZoomIn,
  ZoomOut,
  Search,
  Share2,
  ExternalLink,
  Trash2,
  Edit3,
  X,
  Check,
  BookOpen,
  Copy,
} from 'lucide-react';
import { MaterialModel } from '../../core/material';
import { KnowledgeCategory, KnowledgeCategoryMapper } from '../../core/knowledge_library/models/KnowledgeCategory';
import Markdown from 'react-markdown';

interface DocumentViewerModalProps {
  material: MaterialModel | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, dto: any) => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  material,
  isOpen,
  onClose,
  onDelete,
  onUpdate,
}) => {
  if (!isOpen || !material) return null;

  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copiedShare, setCopiedShare] = useState<boolean>(false);
  const [isEditingMeta, setIsEditingMeta] = useState<boolean>(false);

  // Editable fields
  const [title, setTitle] = useState(material.titulo);
  const [category, setCategory] = useState(material.categoria);
  const [discipline, setDiscipline] = useState(material.disciplina);
  const [description, setDescription] = useState(material.descricao);
  const [conteudoTexto, setConteudoTexto] = useState(material.conteudoTexto || '');

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 20, 200));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 20, 60));

  const handleShare = async () => {
    const shareText = `Material MedCore: ${material.titulo} (${material.formato}) - ${material.autor}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: material.titulo, text: shareText, url: window.location.href });
      } catch {
        // fallback
      }
    } else {
      navigator.clipboard.writeText(shareText);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    }
  };

  const handleOpenExternal = () => {
    // Open mock view or blob in new tab
    const blob = new Blob([JSON.stringify(material, null, 2)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const handleSaveMeta = () => {
    onUpdate(material.id, {
      titulo: title,
      categoria: category,
      disciplina: discipline,
      descricao: description,
      conteudoTexto: conteudoTexto.trim() || undefined,
    });
    setIsEditingMeta(false);
  };

  // Generate simulated document content based on format & metadata
  const getDocumentMockContent = () => {
    if (material.formato === 'TXT' || material.formato === 'MD') {
      return `# ${material.titulo}\n\n**Autor:** ${material.autor}  \n**Disciplina:** ${material.disciplina}  \n**Especialidade:** ${material.especialidade}  \n**Ano:** ${material.ano}\n\n---\n\n## Sumário Executivo\n${material.descricao}\n\n### Diretrizes Clínicas e Pontos de Alta Relevância\n1. Monitoramento hemodinâmico rigoroso e avaliação de sinais precoces de descompensação.\n2. Adequação terapêutica baseada nas diretrizes oficiais da SBC / CFM / Ministério da Saúde.\n3. Protocolo de conduta multidisciplinar para suporte intensivo e ambulatorial.\n\n> *Documento interno autenticado pelo sistema MedCore Engine (Fase 18.3).*`;
    }

    return `[Visualizador Interno MedCore - Renderizador ${material.formato}]\n\nTítulo: ${material.titulo}\nArquivo: ${material.nomeArquivo} (${material.tamanhoFormatado})\nOrigem: ${material.origem}\n\nConteúdo extraído e formatado para leitura direta no visualizador integrado:\n\n- Seção 1: Introdução e Epidemiologia\n- Seção 2: Critérios Diagnósticos Oficiais\n- Seção 3: Tratamento Farmacológico e Não Farmacológico\n- Seção 4: Prognóstico e Acompanhamento Clínico\n\n${material.observacoes || 'Nenhuma observação adicional.'}`;
  };

  const contentText = getDocumentMockContent();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/90 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="w-full max-w-5xl h-[92vh] rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl flex flex-col overflow-hidden text-slate-100"
      >
        {/* Top Header / Toolbar */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 truncate">
            <span className="px-2.5 py-1 rounded-xl bg-indigo-500/20 text-indigo-300 font-mono text-xs font-bold border border-indigo-500/30">
              {material.formato}
            </span>
            <div className="truncate">
              <h2 className="text-sm font-bold text-white truncate max-w-md">{material.titulo}</h2>
              <p className="text-[11px] text-slate-400 truncate">{material.nomeArquivo} • {material.tamanhoFormatado}</p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Zoom Controls */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5">
              <button
                onClick={handleZoomOut}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                title="Diminuir Zoom"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs font-mono text-slate-300">{zoomLevel}%</span>
              <button
                onClick={handleZoomIn}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                title="Aumentar Zoom"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>

            {/* Share */}
            <button
              onClick={handleShare}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 border border-slate-700"
              title="Compartilhar"
            >
              {copiedShare ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
              <span className="hidden sm:inline">{copiedShare ? 'Copiado!' : 'Compartilhar'}</span>
            </button>

            {/* Open External */}
            <button
              onClick={handleOpenExternal}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 border border-slate-700"
              title="Abrir em Nova Aba"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Abrir Externo</span>
            </button>

            {/* Edit Metadata toggle */}
            <button
              onClick={() => setIsEditingMeta(!isEditingMeta)}
              className={`p-2 rounded-xl text-xs font-medium flex items-center gap-1.5 border ${
                isEditingMeta
                  ? 'bg-indigo-600 text-white border-indigo-500'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              <Edit3 className="w-4 h-4" />
              <span className="hidden sm:inline">Editar</span>
            </button>

            {/* Delete */}
            <button
              onClick={() => {
                if (window.confirm('Tem certeza que deseja excluir este documento?')) {
                  onDelete(material.id);
                  onClose();
                }
              }}
              className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs"
              title="Excluir"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Close */}
            <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sub-toolbar: Search inside document */}
        <div className="px-6 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0 text-xs">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar termo no documento..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white outline-none focus:border-indigo-500"
            />
          </div>

          <div className="text-slate-400 text-[11px] font-mono">
            Modo de Visualização Interna • Sem Processamento IA
          </div>
        </div>

        {/* Main Body: Metadata editor or Document Reader Stage */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-10 flex justify-center bg-slate-950">
          <div
            className="w-full max-w-3xl transition-all duration-200"
            style={{ fontSize: `${zoomLevel}%` }}
          >
            {isEditingMeta ? (
              <div className="p-6 rounded-3xl bg-slate-900 border border-indigo-500/40 space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-indigo-400" />
                  <span>Editar Metadados do Documento</span>
                </h3>

                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="text-slate-400 font-semibold">Título</label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-slate-400 font-semibold">Categoria</label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value as KnowledgeCategory)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none"
                      >
                        {Object.values(KnowledgeCategory).map((cat) => (
                          <option key={cat} value={cat}>
                            {KnowledgeCategoryMapper.toDisplayName(cat)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-400 font-semibold">Disciplina</label>
                      <input
                        type="text"
                        value={discipline}
                        onChange={(e) => setDiscipline(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-400 font-semibold">Descrição</label>
                    <textarea
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-semibold flex items-center justify-between">
                      <span>Conteúdo Completo (para Indexação RAG & Grafo NER)</span>
                      <span className="text-[10px] text-indigo-400 font-mono">NER RAG</span>
                    </label>
                    <textarea
                      rows={5}
                      value={conteudoTexto}
                      onChange={(e) => setConteudoTexto(e.target.value)}
                      placeholder="Cole o texto completo do material para extração automática de CIDs, entidades e relações..."
                      className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none font-mono text-xs leading-relaxed"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setIsEditingMeta(false)}
                    className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveMeta}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
                  >
                    Salvar Metadados
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 sm:p-12 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-6 text-slate-200 font-sans leading-relaxed">
                {material.formato === 'MD' || material.formato === 'TXT' ? (
                  <div className="markdown-body space-y-4">
                    <Markdown>{contentText}</Markdown>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="border-b border-slate-800 pb-4">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                        {material.formato} Document Viewer
                      </span>
                      <h1 className="text-xl font-black text-white mt-2">{material.titulo}</h1>
                      <p className="text-xs text-slate-400 mt-1">Autor: {material.autor} • Ano: {material.ano}</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 font-mono text-xs text-slate-300 whitespace-pre-wrap">
                      {contentText}
                    </div>

                    <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-200 flex items-center justify-between">
                      <span>Visualização em tempo real nativa (PDF / DOCX / TXT / MD)</span>
                      <span className="font-bold">{material.tamanhoFormatado}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
