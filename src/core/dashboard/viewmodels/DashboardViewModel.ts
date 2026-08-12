import { useState, useEffect, useCallback } from 'react';
import { medKnowledgeRepository } from '../../../data/repositories_impl/MedKnowledgeRepository';
import { KnowledgeCategory, KnowledgeCategoryMapper } from '../../medcore_kernel/ontology/KnowledgeCategoryMapper';

export interface DashboardStats {
  booksCount: number;
  examsCount: number;
  pdfsCount: number;
  docxCount: number;
  guidelinesCount: number;
  totalItemsCount: number;
  totalStorageBytes: number;
  totalStorageFormatted: string;
  lastUpload: {
    title: string;
    type: string;
    date: string;
  };
  categoryDistribution: { name: string; count: number }[];
  formatDistribution: { name: string; count: number }[];
}

export function useDashboardViewModel() {
  const [stats, setStats] = useState<DashboardStats>({
    booksCount: 0,
    examsCount: 0,
    pdfsCount: 0,
    docxCount: 0,
    guidelinesCount: 0,
    totalItemsCount: 0,
    totalStorageBytes: 0,
    totalStorageFormatted: '0 MB',
    lastUpload: { title: 'Nenhum', type: 'Geral', date: '-' },
    categoryDistribution: [],
    formatDistribution: [],
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadStats = useCallback(async () => {
    setIsLoading(true);

    const assets = await medKnowledgeRepository.getAssets();

    const booksCount = assets.filter((a) => a.category === KnowledgeCategory.book).length;
    const examsCount = assets.filter(
      (a) => a.category === KnowledgeCategory.residencyExam || a.category === KnowledgeCategory.professorExam
    ).length;
    const guidelinesCount = assets.filter((a) => a.category === KnowledgeCategory.guideline).length;

    let pdfsCount = 0;
    let docxCount = 0;
    let totalBytes = 0;

    let latestDate = new Date(0);
    let latestTitle = 'Sistema Inicializado';
    let latestType = 'Sistema';

    assets.forEach((a) => {
      const size = a.file?.size || 1048576;
      totalBytes += size;

      const format = (a.file?.extension || a.file?.type || 'PDF').toUpperCase();
      if (format.includes('PDF')) pdfsCount++;
      if (format.includes('DOCX') || format.includes('DOC')) docxCount++;

      const d = new Date(a.createdAt || Date.now());
      if (d > latestDate) {
        latestDate = d;
        latestTitle = a.title;
        latestType = KnowledgeCategoryMapper.toDisplayName(a.category);
      }
    });

    const totalItemsCount = assets.length;

    const catMap: Record<string, number> = {};
    assets.forEach((a) => {
      const name = KnowledgeCategoryMapper.toDisplayName(a.category);
      catMap[name] = (catMap[name] || 0) + 1;
    });

    const categoryDistribution = Object.entries(catMap).map(([name, count]) => ({ name, count }));

    const formatDistribution = [
      { name: 'PDF', count: pdfsCount },
      { name: 'DOCX', count: docxCount },
      { name: 'Outros', count: Math.max(0, totalItemsCount - pdfsCount - docxCount) },
    ].filter((f) => f.count > 0);

    const formattedSize =
      totalBytes > 1024 * 1024 * 1024
        ? `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
        : `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;

    setStats({
      booksCount,
      examsCount,
      pdfsCount,
      docxCount,
      guidelinesCount,
      totalItemsCount,
      totalStorageBytes: totalBytes,
      totalStorageFormatted: formattedSize,
      lastUpload: {
        title: latestTitle,
        type: latestType,
        date: latestDate.getTime() > 0 ? latestDate.toLocaleDateString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Recente',
      },
      categoryDistribution,
      formatDistribution,
    });

    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadStats();
    // Subscribe to MedKnowledgeRepository updates (Observer Pattern)
    const unsubscribe = medKnowledgeRepository.subscribe(() => {
      loadStats();
    });
    return unsubscribe;
  }, [loadStats]);

  return {
    stats,
    isLoading,
    refresh: loadStats,
  };
}
