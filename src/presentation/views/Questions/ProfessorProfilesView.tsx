import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useQuestionViewModel } from '../../viewmodels/useQuestionViewModel';
import { useDevice } from '../../../core/responsive/DeviceContext';
import { M3Card } from '../../components/Material3/M3Card';
import { M3Button } from '../../components/Material3/M3Button';
import { DocumentPickerService } from '../../../data/services/DocumentPickerService';
import { ProfessorProfile, ImportedDocument } from '../../../domain/entities/Question';
import { apiUrl } from '../../../lib/apiBaseUrl';
import { ExamDNARadarChart } from '../../components/ExamDNARadarChart';
import { db } from '../../../data/db/database';
import { mapWithConcurrency } from '../../../core/utils/asyncUtils';

import {
  ArrowLeft,
  GraduationCap,
  Plus,
  Trash2,
  Edit2,
  FileText,
  Upload,
  X,
  Brain,
  FileUp,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

interface ProfessorProfilesViewProps {
  onBack: () => void;
}

export const ProfessorProfilesView: React.FC<ProfessorProfilesViewProps> = ({ onBack }) => {
  const { colors } = useDevice();
  const {
    professorProfiles,
    updateProfessorProfile,
    deleteProfessorProfile,
    createProfessorProfile,
  } = useQuestionViewModel();

  const pickerService = new DocumentPickerService();

  const [editingProfile, setEditingProfile] = useState<ProfessorProfile | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');

  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newUploadedFiles, setNewUploadedFiles] = useState<ImportedDocument[]>([]);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  // Batch DNA recalculation state
  const [showBatchConfirmModal, setShowBatchConfirmModal] = useState<boolean>(false);
  const [isBatchRecalculating, setIsBatchRecalculating] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; currentName: string }>({
    current: 0,
    total: 0,
    currentName: '',
  });
  const [batchResultModal, setBatchResultModal] = useState<{
    total: number;
    successCount: number;
    failed: Array<{ name: string; reason: string }>;
  } | null>(null);

  const handleStartBatchRecalculate = async () => {
    setShowBatchConfirmModal(false);
    setIsBatchRecalculating(true);

    try {
      const allProfiles = await db.professorProfiles.toArray();
      if (allProfiles.length === 0) {
        setIsBatchRecalculating(false);
        return;
      }

      setBatchProgress({ current: 0, total: allProfiles.length, currentName: '' });

      let successCount = 0;
      const failed: Array<{ name: string; reason: string }> = [];
      let completedCount = 0;

      await mapWithConcurrency(allProfiles, 2, async (profile) => {
        setBatchProgress((prev) => ({
          ...prev,
          currentName: profile.name,
        }));

        try {
          const docTexts = (profile.documents || [])
            .map((d) => (d.extractedExcerpt ? `[Documento: ${d.fileName}]\n${d.extractedExcerpt}` : `[Documento: ${d.fileName}]`))
            .join('\n\n');

          const res = await fetch(apiUrl('/api/clone-exam-style'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              profileName: profile.name,
              sourceExamName: profile.name,
              examText: docTexts,
              documents: profile.documents,
            }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${res.status}: Erro na análise`);
          }

          const data = await res.json();
          if (!data.success || !data.profile) {
            throw new Error(data.error || 'Resposta inválida do servidor');
          }

          const styleAnalysis = data.profile.styleAnalysis;
          const examDNA = data.profile.examDNA || styleAnalysis?.examDNA || profile.examDNA;

          const updatedProfile: ProfessorProfile = {
            ...profile,
            styleAnalysis,
            examDNA,
            updatedAt: new Date().toISOString(),
          };

          await db.professorProfiles.put(updatedProfile);
          await updateProfessorProfile(updatedProfile);
          successCount++;
        } catch (err: any) {
          console.error(`[BatchDNA] Erro ao recalcular perfil "${profile.name}":`, err);
          failed.push({ name: profile.name, reason: err.message || String(err) });
        } finally {
          completedCount++;
          setBatchProgress({
            current: completedCount,
            total: allProfiles.length,
            currentName: profile.name,
          });
        }
      });

      setBatchResultModal({
        total: allProfiles.length,
        successCount,
        failed,
      });
    } catch (err: any) {
      alert('Erro inesperado no recálculo em lote: ' + (err.message || String(err)));
    } finally {
      setIsBatchRecalculating(false);
    }
  };

  const handleAnalyzeStyle = async (profile: ProfessorProfile) => {
    setAnalyzingId(profile.id);
    try {
      const docTexts = (profile.documents || [])
        .map((d) => (d.extractedExcerpt ? `[Documento: ${d.fileName}]\n${d.extractedExcerpt}` : `[Documento: ${d.fileName}]`))
        .join('\n\n');

      const res = await fetch(apiUrl('/api/clone-exam-style'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileName: profile.name,
          sourceExamName: profile.name,
          examText: docTexts,
          documents: profile.documents,
        }),

      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Falha na requisição de análise de estilo do professor');
      }

      const data = await res.json();
      if (!data.success || !data.profile) {
        throw new Error(data.error || 'Resposta inválida do servidor');
      }

      const styleAnalysis = data.profile.styleAnalysis;
      const examDNA = data.profile.examDNA || styleAnalysis?.examDNA || profile.examDNA;

      const updatedProfile: ProfessorProfile = {
        ...profile,
        styleAnalysis,
        examDNA,
        updatedAt: new Date().toISOString(),
      };
      await updateProfessorProfile(updatedProfile);
    } catch (err: any) {
      alert('Erro ao analisar estilo do professor: ' + (err.message || String(err)));
    } finally {
      setAnalyzingId(null);
    }
  };


  // Start edit profile
  const handleStartEdit = (profile: ProfessorProfile) => {
    setEditingProfile(profile);
    setEditName(profile.name);
    setEditDescription(profile.description || '');
  };

  // Save profile updates
  const handleSaveEdit = async () => {
    if (!editingProfile) return;
    try {
      const updatedProfile: ProfessorProfile = {
        ...editingProfile,
        name: editName,
        description: editDescription,
        updatedAt: new Date().toISOString(),
      };
      await updateProfessorProfile(updatedProfile);
      setEditingProfile(null);
    } catch (err: any) {
      alert('Erro ao atualizar perfil do professor.');
    }
  };

  // Delete profile
  const handleDelete = async (profileId: string) => {
    if (window.confirm('Deseja realmente excluir este Perfil de Professor e todas as suas provas associadas?')) {
      await deleteProfessorProfile(profileId);
    }
  };

  // Add more files to existing profile
  const handleAddFilesToProfile = async (profile: ProfessorProfile) => {
    try {
      const files = await pickerService.selectFilesFromDevice();
      if (!files || files.length === 0) return;

      const newDocs: ImportedDocument[] = files.map((f) => {
        const imported = pickerService.createImportedFile(f);
        return {
          id: imported.id,
          fileName: imported.name,
          fileType: imported.type,
          fileSize: imported.size,
          formattedSize: imported.formattedSize,
          uploadProgress: 100,
          status: 'completed',
          uploadedAt: new Date().toISOString(),
        };
      });

      const updatedDocs = [...profile.documents, ...newDocs];
      const totalExamsCount = updatedDocs.length;
      const totalFilesSize = updatedDocs.reduce((sum, d) => sum + d.fileSize, 0);

      const updatedProfile: ProfessorProfile = {
        ...profile,
        documents: updatedDocs,
        totalExamsCount,
        totalFilesSize,
        formattedTotalSize: pickerService.formatFileSize(totalFilesSize),
        updatedAt: new Date().toISOString(),
      };

      await updateProfessorProfile(updatedProfile);
    } catch (err) {
      console.error('Erro ao anexar arquivos:', err);
    }
  };

  // Remove document from profile
  const handleRemoveDocFromProfile = async (profile: ProfessorProfile, docId: string) => {
    const updatedDocs = profile.documents.filter((d) => d.id !== docId);
    const totalExamsCount = updatedDocs.length;
    const totalFilesSize = updatedDocs.reduce((sum, d) => sum + d.fileSize, 0);

    const updatedProfile: ProfessorProfile = {
      ...profile,
      documents: updatedDocs,
      totalExamsCount,
      totalFilesSize,
      formattedTotalSize: pickerService.formatFileSize(totalFilesSize),
      updatedAt: new Date().toISOString(),
    };

    await updateProfessorProfile(updatedProfile);
  };

  // Create Profile Modal Upload
  const handleSelectNewModalFiles = async () => {
    try {
      const files = await pickerService.selectFilesFromDevice();
      if (!files || files.length === 0) return;

      const newDocs: ImportedDocument[] = files.map((f) => {
        const imported = pickerService.createImportedFile(f);
        return {
          id: imported.id,
          fileName: imported.name,
          fileType: imported.type,
          fileSize: imported.size,
          formattedSize: imported.formattedSize,
          uploadProgress: 100,
          status: 'completed',
          uploadedAt: new Date().toISOString(),
        };
      });

      setNewUploadedFiles((prev) => [...prev, ...newDocs]);
    } catch (err) {
      console.error('Erro ao selecionar arquivos:', err);
    }
  };

  const handleCreateNewProfile = async () => {
    if (!newName.trim()) {
      alert('Informe o nome do professor.');
      return;
    }
    try {
      await createProfessorProfile(newName, newDescription, newUploadedFiles);
      setNewName('');
      setNewDescription('');
      setNewUploadedFiles([]);
      setShowCreateModal(false);
    } catch (err) {
      alert('Erro ao criar perfil.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-purple-400" />
              <span>Perfis de Professor Cadastrados</span>
            </h2>
            <p className="text-xs opacity-75">
              Gerencie os perfis abstratos e provas importadas de cada docente
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {professorProfiles.length > 0 && (
            <M3Button
              variant="outlined"
              icon={<RefreshCw className={`w-4 h-4 text-purple-400 ${isBatchRecalculating ? 'animate-spin' : ''}`} />}
              disabled={isBatchRecalculating}
              onClick={() => setShowBatchConfirmModal(true)}
              className="border-purple-500/30 hover:bg-purple-500/10 text-purple-300 text-xs"
            >
              {isBatchRecalculating
                ? `Recalculando (${batchProgress.current}/${batchProgress.total})...`
                : 'Recalcular DNA de Todas as Bancas'}
            </M3Button>
          )}

          <M3Button
            variant="filled"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setShowCreateModal(true)}
            className="bg-purple-600 hover:bg-purple-500 text-white"
          >
            Novo Perfil
          </M3Button>
        </div>
      </div>

      {/* Batch Recalculation Progress Bar */}
      {isBatchRecalculating && (
        <M3Card className="p-4 bg-purple-950/40 border border-purple-500/30 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-purple-200">
            <span className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
              <span>Recalculando DNA: <strong>{batchProgress.currentName || 'Processando...'}</strong></span>
            </span>
            <span className="font-mono">
              {batchProgress.current} de {batchProgress.total} bancas ({Math.round((batchProgress.current / (batchProgress.total || 1)) * 100)}%)
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-300 rounded-full"
              style={{ width: `${Math.round((batchProgress.current / (batchProgress.total || 1)) * 100)}%` }}
            />
          </div>
        </M3Card>
      )}

      {/* Profiles List */}
      {professorProfiles.length === 0 ? (
        <M3Card className="text-center py-12 space-y-3">
          <GraduationCap className="w-12 h-12 mx-auto text-purple-400/40" />
          <h3 className="text-base font-bold">Nenhum Perfil de Professor Cadastrado</h3>
          <p className="text-xs opacity-75 max-w-md mx-auto">
            Cadastre um professor e faça o upload de suas provas passadas para a IA aprender o estilo de cobrança e gerar simulados personalizados.
          </p>
          <div className="pt-2">
            <M3Button
              variant="filled"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setShowCreateModal(true)}
            >
              Cadastrar Primeiro Professor
            </M3Button>
          </div>
        </M3Card>
      ) : (
        <div className="space-y-6">
          {professorProfiles.map((prof) => {
            const style = prof.elaborationStyle;
            const isEditingThis = editingProfile?.id === prof.id;

            return (
              <M3Card
                key={prof.id}
                variant="outlined"
                className="p-6 space-y-5 border-purple-500/20 hover:border-purple-500/40 transition-all"
              >
                {/* Profile Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                  {isEditingThis ? (
                    <div className="space-y-2 flex-1">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl bg-black/20 border border-white/20 text-sm font-bold outline-none"
                      />
                      <input
                        type="text"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl bg-black/20 border border-white/20 text-xs outline-none opacity-80"
                      />
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-lg font-bold text-purple-300 flex items-center gap-2">
                        <span>{prof.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          {prof.totalExamsCount} prova(s)
                        </span>
                      </h3>
                      <p className="text-xs opacity-75 mt-0.5">{prof.description}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {isEditingThis ? (
                      <M3Button variant="filled" size="sm" onClick={handleSaveEdit}>
                        Salvar
                      </M3Button>
                    ) : (
                      <>
                        <M3Button
                          variant="filled"
                          size="sm"
                          disabled={analyzingId === prof.id}
                          onClick={() => handleAnalyzeStyle(prof)}
                          icon={
                            analyzingId === prof.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )
                          }
                          className="bg-purple-600 hover:bg-purple-500 text-white text-xs"
                        >
                          {analyzingId === prof.id
                            ? 'Analisando...'
                            : prof.styleAnalysis
                            ? 'Reanalisar Estilo'
                            : 'Analisar Estilo'}
                        </M3Button>
                        <button
                          onClick={() => handleStartEdit(prof)}
                          title="Editar Perfil"
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(prof.id)}
                          title="Excluir Perfil"
                          className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-slate-300 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Abstract Elaboration Style Attributes (Perfil de Elaboração) */}
                <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/15 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    <span>Perfil de Elaboração Abstrato</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="opacity-60 block">Estilo de Escrita:</span>
                      <span className="font-semibold text-slate-200">{style.writingStyle}</span>
                    </div>
                    <div>
                      <span className="opacity-60 block">Tamanho dos Enunciados:</span>
                      <span className="font-semibold text-slate-200">{style.averageStatementLength}</span>
                    </div>
                    <div>
                      <span className="opacity-60 block">Grau de Dificuldade:</span>
                      <span className="font-semibold text-slate-200">{style.difficultyDegree}</span>
                    </div>
                    <div>
                      <span className="opacity-60 block">Proporção de Casos Clínicos:</span>
                      <span className="font-semibold text-slate-200">{style.clinicalCasesFrequency}</span>
                    </div>
                    <div>
                      <span className="opacity-60 block">Padrão de Alternativas:</span>
                      <span className="font-semibold text-slate-200">{style.optionsPattern}</span>
                    </div>
                    <div>
                      <span className="opacity-60 block">Integração Interdisciplinar:</span>
                      <span className="font-semibold text-slate-200">{style.interdisciplinaryIntegration}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/10 text-xs space-y-1">
                    <span className="opacity-60 block">Temas Recorrentes:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {style.recurringThemes.map((theme, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-200 border border-purple-500/20 text-[11px]"
                        >
                          {theme}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Real AI Style Analysis Section */}
                {prof.styleAnalysis && (
                  <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                        <Sparkles className="w-4 h-4" />
                        <span>Análise Real de Estilo de Prova (IA)</span>
                      </h4>
                      {prof.styleAnalysis.analyzedAt && (
                        <span className="text-[10px] opacity-60">
                          Analisado em {new Date(prof.styleAnalysis.analyzedAt).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>

                    <div className="space-y-2.5 text-xs">
                      {/* Temas Favoritos */}
                      {prof.styleAnalysis.temasFavoritos && prof.styleAnalysis.temasFavoritos.length > 0 && (
                        <div>
                          <span className="opacity-60 block mb-1">Temas Favoritos / Recorrentes:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {prof.styleAnalysis.temasFavoritos.map((t, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Estilo de Questão & Nível Cognitivo */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <div>
                          <span className="opacity-60 block">Estilo de Questão:</span>
                          <span className="font-medium text-slate-200">{prof.styleAnalysis.estiloDeQuestao}</span>
                        </div>
                        <div>
                          <span className="opacity-60 block">Nível Cognitivo:</span>
                          <span className="font-medium text-slate-200">{prof.styleAnalysis.nivelCognitivo}</span>
                        </div>
                      </div>

                      {/* Pegadinhas Recorrentes */}
                      {prof.styleAnalysis.pegadinhasRecorrentes && prof.styleAnalysis.pegadinhasRecorrentes.length > 0 && (
                        <div className="pt-1">
                          <span className="opacity-60 block mb-1">Pegadinhas Recorrentes:</span>
                          <ul className="list-disc list-inside space-y-0.5 text-slate-300 pl-1">
                            {prof.styleAnalysis.pegadinhasRecorrentes.map((p, idx) => (
                              <li key={idx}>{p}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Resumo Estilo Geral */}
                      {prof.styleAnalysis.resumoEstiloGeral && (
                        <div className="p-2.5 rounded-xl bg-black/20 border border-white/10 italic text-slate-300 mt-1">
                          "{prof.styleAnalysis.resumoEstiloGeral}"
                        </div>
                      )}

                      {/* Exam DNA Radar Chart */}
                      {(prof.examDNA || prof.styleAnalysis.examDNA) && (
                        <ExamDNARadarChart dna={(prof.examDNA || prof.styleAnalysis.examDNA)!} className="pt-2 border-t border-white/10" />
                      )}
                    </div>
                  </div>
                )}

                {/* Attached Exams & Documents Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-purple-400" />
                      <span>Provas Anexadas ({prof.documents.length}) - Total: {prof.formattedTotalSize}</span>
                    </h4>

                    <button
                      onClick={() => handleAddFilesToProfile(prof)}
                      className="text-xs font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Anexar Prova</span>
                    </button>
                  </div>

                  {prof.documents.length === 0 ? (
                    <p className="text-xs opacity-60 italic">Nenhuma prova anexada a este perfil ainda.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {prof.documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <FileText className="w-4 h-4 text-purple-400 shrink-0" />
                            <span className="truncate font-semibold">{doc.fileName}</span>
                            <span className="opacity-50 text-[10px]">({doc.formattedSize})</span>
                          </div>

                          <button
                            onClick={() => handleRemoveDocFromProfile(prof, doc.id)}
                            className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </M3Card>
            );
          })}
        </div>
      )}

      {/* Modal to Create New Professor Profile */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg rounded-3xl p-6 space-y-4 border border-purple-500/30 shadow-2xl"
              style={{ backgroundColor: colors.surfaceContainerHigh }}
            >
              <h3 className="text-lg font-bold text-purple-300 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-purple-400" />
                <span>Cadastrar Novo Perfil de Professor</span>
              </h3>

              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="font-semibold opacity-80">Nome do Professor:</label>
                  <input
                    type="text"
                    placeholder="Ex: Prof. Dr. Silva - Cardiologia HC"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/20 border border-white/10 outline-none text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold opacity-80">Descrição / Disciplina:</label>
                  <input
                    type="text"
                    placeholder="Ex: Professor titular de Clínica Médica"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-black/20 border border-white/10 outline-none"
                  />
                </div>

                {/* File Upload in Modal */}
                <div className="space-y-2 pt-2">
                  <label className="font-semibold opacity-80 block">Provas do Professor (Múltiplos Arquivos):</label>
                  <button
                    onClick={handleSelectNewModalFiles}
                    className="w-full py-3 rounded-xl border border-dashed border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Selecionar Provas (.pdf, .docx, imagens)</span>
                  </button>

                  {newUploadedFiles.length > 0 && (
                    <div className="max-h-32 overflow-y-auto space-y-1 pr-1 pt-1">
                      {newUploadedFiles.map((doc) => (
                        <div key={doc.id} className="p-2 rounded-lg bg-white/5 text-[11px] flex justify-between">
                          <span className="truncate">{doc.fileName}</span>
                          <span className="opacity-60">{doc.formattedSize}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <M3Button variant="text" onClick={() => setShowCreateModal(false)}>
                  Cancelar
                </M3Button>
                <M3Button variant="filled" onClick={handleCreateNewProfile}>
                  Salvar Perfil
                </M3Button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Batch Recalculate Confirmation Modal */}
        {showBatchConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-3xl p-6 bg-slate-900 border border-purple-500/30 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-400" />
                  <span>Recalcular DNA em Lote</span>
                </h3>
                <button onClick={() => setShowBatchConfirmModal(false)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                <p>
                  Esta operação vai reprocessar as matrizes de estilo e vetores ExamDNA de{' '}
                  <strong className="text-purple-300">{professorProfiles.length} perfil(is)</strong> de bancas e professores cadastrados.
                </p>
                <p className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-200">
                  ⚡ O processo utiliza concorrência controlada no servidor. Dependendo do volume de provas e excertos, pode levar alguns minutos.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <M3Button variant="text" onClick={() => setShowBatchConfirmModal(false)}>
                  Cancelar
                </M3Button>
                <M3Button
                  variant="filled"
                  icon={<RefreshCw className="w-4 h-4" />}
                  onClick={handleStartBatchRecalculate}
                  className="bg-purple-600 hover:bg-purple-500 text-white"
                >
                  Iniciar Recálculo
                </M3Button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Batch Recalculate Result Summary Modal */}
        {batchResultModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-3xl p-6 bg-slate-900 border border-slate-800 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  {batchResultModal.failed.length === 0 ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                  )}
                  <span>Resultado do Recálculo em Lote</span>
                </h3>
                <button onClick={() => setBatchResultModal(null)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-between text-xs font-semibold">
                  <span>Perfis processados:</span>
                  <span className="font-mono text-white">
                    {batchResultModal.successCount} de {batchResultModal.total} com sucesso
                  </span>
                </div>

                {batchResultModal.failed.length > 0 && (
                  <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs space-y-2">
                    <span className="font-bold block">Falhas ({batchResultModal.failed.length}):</span>
                    <div className="max-h-32 overflow-y-auto space-y-1.5 font-mono text-[11px]">
                      {batchResultModal.failed.map((f, i) => (
                        <div key={i} className="p-1.5 rounded bg-black/30">
                          <strong>{f.name}:</strong> {f.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end pt-3 border-t border-slate-800">
                <M3Button variant="filled" onClick={() => setBatchResultModal(null)} className="bg-indigo-600 text-white">
                  Fechar
                </M3Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
