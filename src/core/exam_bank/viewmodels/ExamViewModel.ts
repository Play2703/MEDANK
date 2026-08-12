/**
 * MedCore Exam ViewModel - Phase 18.4
 *
 * Reactive state and operations for Exam Bank (Banco de Provas).
 */

import { useState, useEffect, useCallback } from 'react';
import { ExamModel, ExamCreateDTO, ExamUpdateDTO, ExamCategory } from '../models/ExamModel';
import { ExamProvider } from '../providers/ExamProvider';
import { medKnowledgeRepository } from '../../../data/repositories_impl/MedKnowledgeRepository';

export function useExamViewModel() {
  const repository = ExamProvider.getRepository();

  const [exams, setExams] = useState<ExamModel[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search & Sort
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedYear, setSelectedYear] = useState<string>('Todos');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'year'>('date');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [selectedExamForDetail, setSelectedExamForDetail] = useState<ExamModel | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);

  const loadExams = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await repository.getAllExams();
      setExams(data);
    } catch (err: any) {
      setError(err?.message || 'Falha ao carregar Banco de Provas.');
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    loadExams();
    const unsubscribe = medKnowledgeRepository.subscribe(() => {
      loadExams();
    });
    return unsubscribe;
  }, [loadExams]);

  const createExam = async (dto: ExamCreateDTO) => {
    try {
      await repository.createExam(dto);
      await loadExams();
      setIsCreateModalOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Erro ao cadastrar prova.');
    }
  };

  const updateExam = async (id: string, dto: ExamUpdateDTO) => {
    try {
      await repository.updateExam(id, dto);
      await loadExams();
    } catch (err: any) {
      setError(err?.message || 'Erro ao atualizar prova.');
    }
  };

  const deleteExam = async (id: string) => {
    try {
      await repository.deleteExam(id);
      await loadExams();
      if (selectedExamForDetail?.id === id) {
        setIsDetailModalOpen(false);
        setSelectedExamForDetail(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao excluir prova.');
    }
  };

  const resetToSeed = async () => {
    setIsLoading(true);
    try {
      await repository.resetToSeed();
      await loadExams();
    } catch (err: any) {
      setError(err?.message || 'Erro ao restaurar banco.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredExams = exams
    .filter((item) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        item.titulo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.instituição.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.disciplina.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.especialidade.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCategory = selectedCategory === 'Todas' || item.tipo === selectedCategory;
      const matchesYear = selectedYear === 'Todos' || item.ano.toString() === selectedYear;

      return matchesSearch && matchesCategory && matchesYear;
    })
    .sort((a, b) => {
      if (sortBy === 'title') {
        return a.titulo.localeCompare(b.titulo);
      }
      if (sortBy === 'year') {
        return b.ano - a.ano;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const stats = {
    totalExams: exams.length,
    institutionsCount: Array.from(new Set(exams.map((e) => e.instituição))).length,
    categoriesCount: Array.from(new Set(exams.map((e) => e.tipo))).length,
    totalSizeFormatted: formatBytesSum(exams.reduce((acc, e) => acc + e.tamanhoArquivo, 0)),
  };

  return {
    exams: filteredExams,
    allExamsCount: exams.length,
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
  };
}

function formatBytesSum(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
