/**
 * MedCore Material ViewModel - Phase 18.1 & 18.2
 *
 * ViewModel managing reactive state for MedCore Library materials, filtering,
 * real multi-file uploads with progress animation, success/error notifications,
 * and CRUD operations.
 */

import { useState, useEffect, useCallback } from 'react';
import { MaterialModel, MaterialCreateDTO, MaterialUpdateDTO, MaterialFormat } from '../models/MaterialModel';
import { KnowledgeCategory } from '../../knowledge_library/models/KnowledgeCategory';
import { KnowledgeCategoryMapper } from '../../medcore_kernel/ontology/KnowledgeCategoryMapper';
import { medKnowledgeRepository } from '../../../data/repositories_impl/MedKnowledgeRepository';
import { MaterialProvider } from '../providers/MaterialProvider';

export function useMaterialViewModel() {
  const repository = MaterialProvider.getRepository();

  const [materials, setMaterials] = useState<MaterialModel[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters & Sort
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('Todas');
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>('Todas');
  const [selectedFormat, setSelectedFormat] = useState<string>('Todos');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'size'>('date');

  // Modal States
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const [selectedItemForDetail, setSelectedItemForDetail] = useState<MaterialModel | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  const loadMaterials = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await repository.getAllMaterials();
      setMaterials(data);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar materiais do repositório.');
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    loadMaterials();
    const unsubscribe = medKnowledgeRepository.subscribe(() => {
      loadMaterials();
    });
    return unsubscribe;
  }, [loadMaterials]);

  // Stage files from File Picker (Phase 18.2)
  const stageFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    setStagedFiles(fileArray);
    setIsImportModalOpen(true);
    setUploadStatus('idle');
    setUploadProgress(0);
    setUploadMessage(null);
  };

  // Confirm and upload staged files (Phase 18.2 with animated progress)
  const confirmUploadStagedFiles = async (metadataOverrides: Partial<MaterialCreateDTO>[]) => {
    if (stagedFiles.length === 0) return;

    setUploadStatus('uploading');
    setUploadProgress(10);
    setUploadMessage('Preparando arquivos para armazenamento interno...');

    try {
      for (let i = 0; i < stagedFiles.length; i++) {
        const file = stagedFiles[i];
        const override = metadataOverrides[i] || {};
        const progressStep = Math.round(((i + 1) / stagedFiles.length) * 80) + 10;
        setUploadProgress(progressStep);

        const ext = file.name.split('.').pop()?.toUpperCase() || 'PDF';
        const formato: MaterialFormat = ['PDF', 'DOCX', 'PPTX', 'TXT', 'MD', 'EPUB'].includes(ext) ? ext : 'PDF';

        const dto: MaterialCreateDTO = {
          titulo: override.titulo || file.name.replace(/\.[^/.]+$/, ''),
          categoria: override.categoria || KnowledgeCategory.article,
          disciplina: override.disciplina || 'Clínica Médica',
          especialidade: override.especialidade || 'Medicina Geral',
          autor: override.autor || 'Autor Desconhecido',
          ano: override.ano || new Date().getFullYear(),
          descricao: override.descricao || `Documento importado via upload direto (${file.name}).`,
          idioma: override.idioma || 'Português (BR)',
          tipo: override.tipo || 'Documento Oficial',
          status: 'Importado',
          tags: override.tags || [ext, 'Upload'],
          observacoes: override.observacoes || 'Importado com sucesso para o MedCore.',
          nomeArquivo: file.name,
          tamanhoArquivo: file.size,
          formato,
          origem: 'Upload Nativo',
        };

        await repository.createMaterial(dto);
      }

      setUploadProgress(100);
      setUploadStatus('success');
      setUploadMessage(`${stagedFiles.length} arquivo(s) importado(s) com sucesso!`);

      await loadMaterials();

      setTimeout(() => {
        setIsImportModalOpen(false);
        setStagedFiles([]);
        setUploadStatus('idle');
        setUploadProgress(0);
        setUploadMessage(null);
      }, 1500);
    } catch (err: any) {
      setUploadStatus('error');
      setUploadMessage(err?.message || 'Erro durante o upload dos arquivos.');
    }
  };

  const updateMaterialDetails = async (id: string, dto: MaterialUpdateDTO) => {
    try {
      await repository.updateMaterial(id, dto);
      await loadMaterials();
    } catch (err: any) {
      setError(err?.message || 'Falha ao atualizar material.');
    }
  };

  const deleteMaterial = async (id: string) => {
    try {
      await repository.deleteMaterial(id);
      await loadMaterials();
      if (selectedItemForDetail?.id === id) {
        setIsDetailModalOpen(false);
        setSelectedItemForDetail(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Falha ao excluir material.');
    }
  };

  const resetToSeed = async () => {
    setIsLoading(true);
    try {
      await repository.resetToSeed();
      await loadMaterials();
    } catch (err: any) {
      setError(err?.message || 'Falha ao restaurar dados padrão.');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter & Sort logic
  const filteredMaterials = materials.filter((item) => {
    const matchesSearch =
      searchQuery.trim() === '' ||
      item.titulo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.autor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.disciplina.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.especialidade.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = (() => {
      if (selectedCategory === 'Todas') return true;

      // Direct enum or display type match
      if (item.categoria === selectedCategory || item.tipo === selectedCategory) return true;

      // Map UI tab name (Livros, Provas, Diretrizes, Artigos, Apostilas, Protocolos)
      const mappedCategory = KnowledgeCategoryMapper.fromDisplayName(selectedCategory);
      if (mappedCategory !== KnowledgeCategory.other) {
        if (item.categoria === mappedCategory) return true;
        if (selectedCategory === 'Provas' && (item.categoria === KnowledgeCategory.residencyExam || item.categoria === KnowledgeCategory.professorExam || item.categoria === KnowledgeCategory.questionBank)) return true;
        if (selectedCategory === 'Livros' && (item.categoria === KnowledgeCategory.book || item.categoria === KnowledgeCategory.manual)) return true;
        if (selectedCategory === 'Diretrizes' && (item.categoria === KnowledgeCategory.guideline || item.categoria === KnowledgeCategory.protocol)) return true;
        if (selectedCategory === 'Apostilas' && (item.categoria === KnowledgeCategory.apostila || item.categoria === KnowledgeCategory.manual)) return true;
      }

      return false;
    })();
    const matchesSpecialty = selectedSpecialty === 'Todas' || item.especialidade === selectedSpecialty;
    const matchesDiscipline = selectedDiscipline === 'Todas' || item.disciplina === selectedDiscipline;
    const matchesFormat = selectedFormat === 'Todos' || item.formato === selectedFormat;

    return matchesSearch && matchesCategory && matchesSpecialty && matchesDiscipline && matchesFormat;
  }).sort((a, b) => {
    if (sortBy === 'title') {
      return a.titulo.localeCompare(b.titulo);
    }
    if (sortBy === 'size') {
      return b.tamanhoArquivo - a.tamanhoArquivo;
    }
    // default date
    return new Date(b.dataImportacao).getTime() - new Date(a.dataImportacao).getTime();
  });

  // Statistics calculation
  const stats = {
    totalItems: materials.length,
    totalSize: materials.reduce((acc, m) => acc + m.tamanhoArquivo, 0),
    totalSizeFormatted: formatBytesSum(materials.reduce((acc, m) => acc + m.tamanhoArquivo, 0)),
    categoriesCount: Array.from(new Set(materials.map((m) => m.categoria))).length,
  };

  return {
    materials: filteredMaterials,
    allMaterialsCount: materials.length,
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
    // Import & Upload state
    isImportModalOpen,
    setIsImportModalOpen,
    stagedFiles,
    setStagedFiles,
    stageFiles,
    confirmUploadStagedFiles,
    uploadProgress,
    uploadStatus,
    uploadMessage,
    // Detail modal state
    isDetailModalOpen,
    setIsDetailModalOpen,
    selectedItemForDetail,
    setSelectedItemForDetail,
    // Actions
    loadMaterials,
    updateMaterialDetails,
    deleteMaterial,
    resetToSeed,
    stats,
  };
}

function formatBytesSum(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
