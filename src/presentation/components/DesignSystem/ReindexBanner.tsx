import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { realSemanticSearchService } from '../../../data/services/RealSemanticSearchService';
import { M3Button } from '../Material3/M3Button';

interface ReindexBannerProps {
  className?: string;
  onReindexComplete?: () => void;
}

export const ReindexBanner: React.FC<ReindexBannerProps> = ({ className = '', onReindexComplete }) => {
  const [hasOutdated, setHasOutdated] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [successMessage, setSuccessMessage] = useState(false);

  useEffect(() => {
    let isMounted = true;
    realSemanticSearchService.checkForOutdatedEmbeddings().then((outdated) => {
      if (isMounted) {
        setHasOutdated(outdated);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleStartReindex = async () => {
    setIsReindexing(true);
    setProgress({ current: 0, total: 100 });

    try {
      await realSemanticSearchService.reindexOutdatedEmbeddings((current, total) => {
        setProgress({ current, total });
      });

      setSuccessMessage(true);
      setHasOutdated(false);

      if (onReindexComplete) {
        onReindexComplete();
      }

      setTimeout(() => {
        setSuccessMessage(false);
      }, 4000);
    } catch (err) {
      console.error('[ReindexBanner] Error during reindexing:', err);
    } finally {
      setIsReindexing(false);
      setProgress(null);
    }
  };

  if (!hasOutdated && !successMessage) {
    return null;
  }

  if (successMessage) {
    return (
      <div className={`p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center space-x-3 text-emerald-400 mb-6 ${className}`}>
        <CheckCircle2 className="w-5 h-5 shrink-0" />
        <p className="text-sm font-medium">Reindexação concluída com sucesso! Todos os documentos estão usando o motor local atualizado.</p>
      </div>
    );
  }

  return (
    <div className={`p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 ${className}`}>
      <div className="flex items-start space-x-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-amber-300">Motor de Busca Semântica Desatualizado</h4>
          <p className="text-xs text-amber-200/80 mt-0.5">
            Existem documentos em sua biblioteca indexados com uma versão antiga do motor. Reindexe agora para garantir respostas RAG com máxima precisão.
          </p>
          {isReindexing && progress && (
            <div className="mt-3 w-full max-w-md">
              <div className="flex justify-between text-xs text-amber-300 font-medium mb-1">
                <span>Reindexando em segundo plano...</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <div className="w-full bg-amber-950/60 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-amber-400 h-full transition-all duration-300 rounded-full"
                  style={{
                    width: `${progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <M3Button
        variant="filled"
        onClick={handleStartReindex}
        disabled={isReindexing}
        className="shrink-0 bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs px-4 py-2"
      >
        <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isReindexing ? 'animate-spin' : ''}`} />
        {isReindexing ? 'Reindexando...' : 'Reindexar Agora'}
      </M3Button>
    </div>
  );
};
