/**
 * MedCore Guideline ViewModel - Phase 18.6
 */

import { useState, useEffect, useCallback } from 'react';
import { GuidelineModel, GuidelineCreateDTO, GuidelineUpdateDTO, GuidelineCategory } from '../models/GuidelineModel';
import { guidelineRepository } from '../repositories/GuidelineRepository';
import { medKnowledgeRepository } from '../../../data/repositories_impl/MedKnowledgeRepository';

export function useGuidelineViewModel() {
  const [guidelines, setGuidelines] = useState<GuidelineModel[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadGuidelines = useCallback(async () => {
    setIsLoading(true);
    const data = await guidelineRepository.getAllAsync();
    setGuidelines(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadGuidelines();
    const unsubscribe = medKnowledgeRepository.subscribe(() => {
      loadGuidelines();
    });
    return unsubscribe;
  }, [loadGuidelines]);

  const addGuideline = (dto: GuidelineCreateDTO) => {
    guidelineRepository.create(dto);
    loadGuidelines();
  };

  const updateGuideline = (id: string, dto: GuidelineUpdateDTO) => {
    guidelineRepository.update(id, dto);
    loadGuidelines();
  };

  const deleteGuideline = (id: string) => {
    guidelineRepository.delete(id);
    loadGuidelines();
  };

  const categories = ['Todas', 'AMB', 'SBM', 'SBC', 'FEBRASGO', 'SBI', 'CFM', 'MS', 'OMS'];

  const filteredGuidelines = guidelines.filter((g) => {
    const matchesSearch =
      g.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.especialidade.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.resumo.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = selectedCategory === 'Todas' || g.categoria === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const totalStorageBytes = guidelines.reduce((acc, curr) => acc + curr.tamanhoArquivo, 0);
  const totalStorageFormatted = `${(totalStorageBytes / (1024 * 1024)).toFixed(1)} MB`;

  return {
    guidelines: filteredGuidelines,
    allCount: guidelines.length,
    searchTerm,
    setSearchTerm,
    selectedCategory,
    setSelectedCategory,
    categories,
    isLoading,
    addGuideline,
    updateGuideline,
    deleteGuideline,
    totalStorageFormatted,
  };
}
