import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Building2,
  GraduationCap,
  FileText,
  Brain,
  Search,
  CheckCircle2,
  BookOpen,
  Layers,
  Sparkles,
  ArrowLeft,
  AlertCircle,
  Database,
} from 'lucide-react';
import { RepositoryFactory } from '../../data/repositories_impl/RepositoryFactory';
import { medKnowledgeRepository } from '../../data/repositories_impl/MedKnowledgeRepository';
import { ImportedOriginSummary } from '../../domain/repositories/IQuestionRepository';
import { KnowledgeAsset } from '../../domain/entities/KnowledgeAsset';

interface BancasProfessoresViewProps {
  type: 'banca' | 'professor';
  onBack?: () => void;
}

interface LinkedOriginItem {
  name: string;
  chunkCount: number;
  type: 'banca' | 'professor';
  linkedAssets: KnowledgeAsset[];
}

const questionRepo = RepositoryFactory.getQuestionRepository();

export const BancasProfessoresView: React.FC<BancasProfessoresViewProps> = ({ type, onBack }) => {
  const [items, setItems] = useState<LinkedOriginItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const isBanca = type === 'banca';

  const loadData = async () => {
    setIsLoading(true);
    try {
      const origins = await questionRepo.getImportedOrigins();
      const filteredOrigins = origins.filter((o) => o.type === type);
      const allAssets = await medKnowledgeRepository.getAssets();

      const combined: LinkedOriginItem[] = filteredOrigins.map((origin) => {
        const nameLower = origin.name.toLowerCase().trim();
        const linked = allAssets.filter((asset) => {
          const b = (asset.board || '').toLowerCase();
          const inst = (asset.institution || '').toLowerCase();
          const prof = (asset.professor || '').toLowerCase();
          const author = (asset.author || '').toLowerCase();
          const title = (asset.title || '').toLowerCase();

          if (isBanca) {
            return b.includes(nameLower) || inst.includes(nameLower) || title.includes(nameLower);
          } else {
            return prof.includes(nameLower) || author.includes(nameLower) || title.includes(nameLower);
          }
        });

        return {
          ...origin,
          linkedAssets: linked,
        };
      });

      setItems(combined);
    } catch (err) {
      console.error('Error loading bancas/professors origins:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [type]);

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalChunks = items.reduce((sum, item) => sum + item.chunkCount, 0);
  const totalAssetsCount = items.reduce((sum, item) => sum + item.linkedAssets.length, 0);

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-2xl border flex items-center justify-center font-bold shadow-inner ${
              isBanca
                ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                : 'bg-purple-500/20 border-purple-500/30 text-purple-400'
            }`}
          >
            {isBanca ? <Building2 className="w-6 h-6" /> : <GraduationCap className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">
                {isBanca ? 'Indexador de Bancas Examinadoras' : 'Indexador de Professores'}
              </h1>
              <span
                className={`text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full font-bold border ${
                  isBanca
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                    : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                }`}
              >
                Indexado RAG 768d
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {isBanca
                ? 'Painel de acompanhamento de provas de residência e vetores de bancas indexados para o Gerador RAG'
                : 'Painel de acompanhamento de materiais e vetores de professores indexados para o Gerador RAG'}
            </p>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {isBanca ? 'Total de Bancas' : 'Total de Professores'}
            </span>
            <div className="text-2xl font-black text-white">{items.length}</div>
          </div>
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
              isBanca
                ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                : 'bg-purple-500/15 border-purple-500/30 text-purple-400'
            }`}
          >
            {isBanca ? <Building2 className="w-5 h-5" /> : <GraduationCap className="w-5 h-5" />}
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Trechos Vetoriais (Chunks RAG)
            </span>
            <div className="text-2xl font-black text-emerald-400">{totalChunks}</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Brain className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Documentos do Acervo Vinculados
            </span>
            <div className="text-2xl font-black text-indigo-400">{totalAssetsCount}</div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <FileText className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Pesquisar ${isBanca ? 'banca' : 'professor'} indexado...`}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-white outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      {/* Main Grid / Cards */}
      {isLoading ? (
        <div className="p-8 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-3">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Escaneando vetores RAG indexados...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-12 rounded-3xl bg-slate-900 border border-slate-800 text-center space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto">
            <Database className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">
              Nenhum{isBanca ? 'a banca' : ' professor'} indexado(a) ainda
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Para alimentar a aba "Baseado em {isBanca ? 'Banca' : 'Professor'}", registe um documento com o campo "{isBanca ? 'Instituição / Banca' : 'Autor / Professor'}" preenchido na aba "Importador de Arquivos".
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.name}
              className="p-5 rounded-3xl bg-slate-900 border border-slate-800 hover:border-indigo-500/40 transition-all space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={`w-10 h-10 rounded-2xl border flex items-center justify-center ${
                      isBanca
                        ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                        : 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                    }`}
                  >
                    {isBanca ? <Building2 className="w-5 h-5" /> : <GraduationCap className="w-5 h-5" />}
                  </div>

                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Ativo em RAG</span>
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-bold text-white">{item.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {item.chunkCount} trechos vetoriais (768d) salvos no Dexie DB
                  </p>
                </div>
              </div>

              {/* Linked Documents List */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Documentos Vinculados ({item.linkedAssets.length})
                </span>

                {item.linkedAssets.length === 0 ? (
                  <p className="text-[11px] text-slate-500 italic">
                    Indexado via upload direto / RAG
                  </p>
                ) : (
                  <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                    {item.linkedAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs flex items-center justify-between gap-2"
                      >
                        <span className="truncate text-slate-200 font-medium">{asset.title}</span>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {asset.year || 2026}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
