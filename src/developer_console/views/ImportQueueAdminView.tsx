import React, { useRef, useState } from 'react';
import { useRiverpodState } from '../../core/riverpod';
import { importProvider } from '../../core/import_engine/providers/ImportProvider';
import { ImportStatus } from '../../core/import_engine/models/ImportStatus';
import { ImportItem } from '../../core/import_engine/models/ImportModels';
import { KnowledgeCategory, KnowledgeCategoryMapper } from '../../core/knowledge_library/models/KnowledgeCategory';
import { ExamQuestionSegmentationModal } from './ExamQuestionSegmentationModal';
import {
  Layers,
  Clock,
  RefreshCw,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Trash2,
  Upload,
  FileText,
  HardDrive,
  Search,
  Filter,
  Edit3,
  FolderOpen,
  Eye,
  Save,
  FileCheck,
  Building,
  User,
  Calendar,
  BookOpen,
  Scissors,
} from 'lucide-react';

const CATEGORIES = [
  'Livro',
  'Prova de Residência',
  'Prova de Professor',
  'Diretriz',
  'Artigo Científico',
  'Slide',
  'Apostila',
  'Aula',
  'Manual',
  'Protocolo',
  'Caso Clínico',
  'Resumo',
  'Flashcards',
  'Documento Institucional',
  'Outro',
];

export const ImportQueueAdminView: React.FC = () => {
  const queueState = useRiverpodState(importProvider);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterInstitution, setFilterInstitution] = useState('all');
  const [filterFileType, setFilterFileType] = useState('all');

  // Editing Metadata Modal State
  const [editingItem, setEditingItem] = useState<ImportItem | null>(null);
  const [previewItem, setPreviewItem] = useState<ImportItem | null>(null);
  const [segmentingItem, setSegmentingItem] = useState<ImportItem | null>(null);

  const items = queueState.items;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      importProvider.notifier.addFiles(e.target.files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Filtered Items
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.titulo && item.titulo.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.disciplina && item.disciplina.toLowerCase().includes(searchTerm.toLowerCase()));

    const effectiveCat = item.categoriaManual || item.categoriaSugerida || 'Outro';
    const matchesCat = filterCategory === 'all' || effectiveCat === filterCategory;

    const matchesStatus = filterStatus === 'all' || item.status === filterStatus;

    const matchesInst =
      filterInstitution === 'all' || (item.instituicao && item.instituicao.includes(filterInstitution));

    const ext = item.metadata?.formato || item.fileName.split('.').pop()?.toUpperCase() || '';
    const matchesType = filterFileType === 'all' || ext === filterFileType;

    return matchesSearch && matchesCat && matchesStatus && matchesInst && matchesType;
  });

  const getStatusBadge = (status: ImportStatus) => {
    switch (status) {
      case ImportStatus.Finalizado:
      case ImportStatus.Completed:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Finalizado
          </span>
        );
      case ImportStatus.Validating:
      case ImportStatus.Lendo:
      case ImportStatus.ExtraindoMetadados:
      case ImportStatus.Classificando:
      case ImportStatus.Organizando:
      case ImportStatus.Armazenando:
      case ImportStatus.ProcessandoRAG:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
            {status} ({itemProgress(status)}%)
          </span>
        );
      case ImportStatus.Erro:
      case ImportStatus.Failed:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            <XCircle className="w-3.5 h-3.5" />
            Erro
          </span>
        );
      case ImportStatus.Cancelado:
      case ImportStatus.Cancelled:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5" />
            Cancelado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            <Clock className="w-3.5 h-3.5" />
            Aguardando
          </span>
        );
    }
  };

  const itemProgress = (status: ImportStatus) => {
    switch (status) {
      case ImportStatus.Validating: return 15;
      case ImportStatus.Lendo: return 35;
      case ImportStatus.ExtraindoMetadados: return 55;
      case ImportStatus.Classificando: return 75;
      case ImportStatus.Organizando: return 90;
      case ImportStatus.Armazenando: return 85;
      case ImportStatus.ProcessandoRAG: return 95;
      case ImportStatus.Finalizado: return 100;
      default: return 0;
    }
  };

  // Renderiza o número de páginas de forma honesta
  const renderPageCount = (item: ImportItem | null): React.ReactNode => {
    if (!item) return 'Não disponível';
    
    const isProcessing = ![ImportStatus.Finalizado, ImportStatus.Erro, ImportStatus.Cancelado].includes(item.status);
    
    if (item.paginas !== undefined && typeof item.paginas === 'number' && item.paginas > 0) {
      return `${item.paginas} página${item.paginas !== 1 ? 's' : ''}`;
    }
    
    if (isProcessing) {
      return 'Calculando...';
    }
    
    return 'Não disponível';
  };

  const totalProgress = queueState.totalItems > 0
    ? Math.round((queueState.completedCount / queueState.totalItems) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Hidden Universal File Picker for all supported formats */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        multiple
        accept=".pdf,.docx,.doc,.ppt,.pptx,.txt,.md,.html,.csv,.xlsx,.epub,.zip,.png,.jpg,.jpeg,.webp"
        className="hidden"
      />

      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-3xl bg-slate-900 border border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Import Center • Fila Universal de Documentos (Fase 18.X)</h2>
              <p className="text-xs text-slate-400">
                Central administrativa exclusiva para ingestão, classificação automática e distribuição para módulos do MedAnki.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors flex items-center gap-2 shadow-lg shadow-indigo-600/20"
          >
            <Upload className="w-4 h-4" />
            <span>Adicionar Documento</span>
          </button>
          {items.length > 0 && (
            <button
              onClick={() => importProvider.notifier.clearQueue()}
              className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors border border-slate-700"
            >
              Limpar Histórico
            </button>
          )}
        </div>
      </div>

      {/* General Progress Bar */}
      {items.length > 0 && (
        <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300">
            <span className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-indigo-400" />
              <span>Progresso Geral do Import Center ({queueState.completedCount} de {queueState.totalItems} finalizados)</span>
            </span>
            <span className="font-mono text-indigo-400">{totalProgress}%</span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
            <div
              className="h-full bg-indigo-500 transition-all duration-300 rounded-full"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Search & Filters Panel */}
      <div className="p-5 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Pesquisar por nome, título ou disciplina..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
            {/* Category Filter */}
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">Todas Categorias</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">Todos Status</option>
              <option value={ImportStatus.Finalizado}>Finalizado</option>
              <option value={ImportStatus.Waiting}>Aguardando</option>
              <option value={ImportStatus.Validating}>Processando</option>
              <option value={ImportStatus.Erro}>Erro</option>
            </select>

            {/* File Type Filter */}
            <select
              value={filterFileType}
              onChange={(e) => setFilterFileType(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">Todos Formatos</option>
              <option value="PDF">PDF</option>
              <option value="DOCX">DOCX</option>
              <option value="PPTX">PPTX</option>
              <option value="EPUB">EPUB</option>
              <option value="TXT">TXT</option>
            </select>
          </div>
        </div>
      </div>

      {/* Documents List (Material 3 Cards) */}
      <div className="space-y-4">
        {filteredItems.length === 0 ? (
          <div className="p-12 text-center rounded-3xl bg-slate-900/50 border border-slate-800 space-y-3">
            <FileText className="w-12 h-12 text-slate-600 mx-auto" />
            <p className="text-sm font-medium text-slate-400">Nenhum documento encontrado na fila de importação.</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>Adicionar Arquivo do Dispositivo</span>
            </button>
          </div>
        ) : (
          filteredItems.map((item, index) => {
            const ext = item.metadata?.formato || item.fileName.split('.').pop()?.toUpperCase() || 'PDF';
            const effectiveCategory = item.categoriaManual || item.categoriaSugerida || KnowledgeCategory.other;
            const isProcessing = ![ImportStatus.Finalizado, ImportStatus.Erro, ImportStatus.Cancelado].includes(item.status);

            return (
              <div
                key={item.id}
                className="p-6 rounded-3xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all space-y-4 shadow-sm"
              >
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0 font-mono text-sm font-bold">
                      {ext}
                    </div>

                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-base font-bold text-white truncate">{item.titulo || item.fileName}</h3>
                        {getStatusBadge(item.status)}
                        <span className="px-2.5 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-indigo-300">
                          Destino: {item.destino}
                        </span>
                        {item.rawFile ? (
                          <span className="px-2.5 py-1 rounded-xl bg-purple-500/15 border border-purple-500/30 text-xs font-semibold text-purple-300" title="Arquivo PDF original disponível para segmentação geométrica">
                            PDF Original Carregado
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-400" title="Apenas texto extraído disponível">
                            Texto Extraído
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-400 font-mono flex-wrap">
                        <span>Arquivo: {item.fileName}</span>
                        <span>•</span>
                        <span>{(item.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                        <span>•</span>
                        <span>{renderPageCount(item)}</span>
                        <span>•</span>
                        <span>Criado: {new Date(item.createdAt).toLocaleDateString('pt-BR')}</span>
                      </div>

                      {/* Auto Classification Badge vs Manual Override */}
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-xs text-slate-400">Categoria (Sugerida: <strong className="text-slate-200">{KnowledgeCategoryMapper.toDisplayName(item.categoriaSugerida || KnowledgeCategory.other)}</strong>):</span>
                        <select
                          value={KnowledgeCategoryMapper.toDisplayName(effectiveCategory)}
                          onChange={(e) => importProvider.notifier.updateItemMetadata(item.id, { categoriaManual: KnowledgeCategoryMapper.fromDisplayName(e.target.value) })}
                          className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1 text-xs font-semibold text-indigo-400 focus:outline-none focus:border-indigo-500"
                        >
                          {Object.values(KnowledgeCategory).map((cat) => (
                            <option key={cat} value={KnowledgeCategoryMapper.toDisplayName(cat)}>{KnowledgeCategoryMapper.toDisplayName(cat)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Operational Actions */}
                  <div className="flex items-center gap-2 self-end lg:self-center flex-wrap">
                    <button
                      onClick={() => setEditingItem(item)}
                      title="Editar Metadados"
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors inline-flex items-center gap-1.5 border border-slate-700"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Metadados</span>
                    </button>

                    {(effectiveCategory === KnowledgeCategory.residencyExam || effectiveCategory === KnowledgeCategory.professorExam || ext === 'PDF') && (
                      <button
                        onClick={() => setSegmentingItem(item)}
                        title="Segmentar Questões Automaticamente (Sem IA)"
                        className="px-3.5 py-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 text-xs font-bold transition-colors inline-flex items-center gap-1.5 border border-purple-500/30"
                      >
                        <Scissors className="w-3.5 h-3.5 text-purple-400" />
                        <span>Segmentar Questões</span>
                      </button>
                    )}

                    <button
                      onClick={() => setPreviewItem(item)}
                      title="Visualizar Documento"
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors inline-flex items-center gap-1.5 border border-slate-700"
                    >
                      <Eye className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Visualizar</span>
                    </button>

                    <button
                      onClick={() => alert(`Abrindo diretório de armazenamento do arquivo: ${item.fileName}`)}
                      title="Abrir Pasta"
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </button>

                    {(item.status === ImportStatus.Erro || item.status === ImportStatus.Cancelado) && (
                      <button
                        onClick={() => importProvider.notifier.restartItem(item.id)}
                        className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Reimportar</span>
                      </button>
                    )}

                    <button
                      onClick={() => importProvider.notifier.removeItem(item.id)}
                      title="Excluir"
                      className="p-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Individual Progress Bar */}
                {isProcessing && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                      <span className="text-indigo-300 font-semibold">Status atual: {item.status}</span>
                      <span>{item.progress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-indigo-500 transition-all duration-300 rounded-full"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* METADATA EDIT MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-indigo-400" />
                <h3 className="text-lg font-bold text-white">Editar Metadados do Documento</h3>
              </div>
              <button
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-white font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Título</label>
                <input
                  type="text"
                  value={editingItem.titulo || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, titulo: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Categoria Manual</label>
                <select
                  value={KnowledgeCategoryMapper.toDisplayName(editingItem.categoriaManual || editingItem.categoriaSugerida || KnowledgeCategory.other)}
                  onChange={(e) => setEditingItem({ ...editingItem, categoriaManual: KnowledgeCategoryMapper.fromDisplayName(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  {Object.values(KnowledgeCategory).map((cat) => (
                    <option key={cat} value={KnowledgeCategoryMapper.toDisplayName(cat)}>{KnowledgeCategoryMapper.toDisplayName(cat)}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Instituição</label>
                <input
                  type="text"
                  value={editingItem.instituicao || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, instituicao: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Professor / Autor</label>
                <input
                  type="text"
                  value={editingItem.professor || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, professor: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Banca / Organizadora</label>
                <input
                  type="text"
                  value={editingItem.banca || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, banca: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Ano</label>
                <input
                  type="number"
                  value={editingItem.ano || new Date().getFullYear()}
                  onChange={(e) => setEditingItem({ ...editingItem, ano: parseInt(e.target.value) || 2026 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Especialidade Médica</label>
                <input
                  type="text"
                  value={editingItem.especialidade || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, especialidade: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Disciplina</label>
                <input
                  type="text"
                  value={editingItem.disciplina || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, disciplina: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Observações</label>
              <textarea
                rows={3}
                value={editingItem.observacoes || ''}
                onChange={(e) => setEditingItem({ ...editingItem, observacoes: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  importProvider.notifier.updateItemMetadata(editingItem.id, editingItem);
                  setEditingItem(null);
                }}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Salvar Alterações</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DOCUMENT PREVIEW MODAL */}
      {previewItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-indigo-400" />
                <h3 className="text-lg font-bold text-white">Visualização do Documento: {previewItem.fileName}</h3>
              </div>
              <button
                onClick={() => setPreviewItem(null)}
                className="text-slate-400 hover:text-white font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs font-mono">
                <div>
                  <span className="text-slate-500 block">Título</span>
                  <strong className="text-white">{previewItem.titulo}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Categoria</span>
                  <strong className="text-indigo-400">{previewItem.categoriaManual || previewItem.categoriaSugerida}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Destino</span>
                  <strong className="text-emerald-400">{previewItem.destino}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Tamanho</span>
                  <strong className="text-white">{(previewItem.fileSize / 1024 / 1024).toFixed(2)} MB</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Páginas Estimadas</span>
                  <strong className="text-white">{renderPageCount(previewItem)}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Ano</span>
                  <strong className="text-white">{previewItem.ano}</strong>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 space-y-2">
                <span className="text-xs font-semibold text-slate-400 block">Pré-visualização do Conteúdo Textual / Metadados:</span>
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 space-y-1">
                  <p>Instituição: {previewItem.instituicao}</p>
                  <p>Autor/Professor: {previewItem.professor}</p>
                  <p>Especialidade: {previewItem.especialidade}</p>
                  <p>Disciplina: {previewItem.disciplina}</p>
                  <p>Observações: {previewItem.observacoes}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => setPreviewItem(null)}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors"
              >
                Fechar Visualização
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXAM QUESTION SEGMENTATION MODAL */}
      {segmentingItem && (
        <ExamQuestionSegmentationModal
          isOpen={!!segmentingItem}
          onClose={() => setSegmentingItem(null)}
          documentTitle={segmentingItem.titulo || segmentingItem.fileName}
          sourceAssetId={segmentingItem.id}
          specialty={segmentingItem.especialidade}
          rawContent={segmentingItem.rawFile || segmentingItem.extractedText || null}
          onSaveQuestions={(extractedQuestions) => {
            console.log(`[ImportQueueAdminView] ${extractedQuestions.length} questões segmentadas com sucesso para ${segmentingItem.fileName}`);
          }}
        />
      )}
    </div>
  );
};
