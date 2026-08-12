import React, { useEffect, useState } from 'react';
import { seedLoaderService, SeedProgressInfo } from '../../data/services/SeedLoaderService';
import { BookOpen, CheckCircle2, Sparkles, X } from 'lucide-react';

export function SeedLoaderDialog() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<SeedProgressInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;
    seedLoaderService.isSeedNeeded().then((needed) => {
      if (isMounted && needed) {
        setShowPrompt(true);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  if (!showPrompt) return null;

  const handleConfirm = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      await seedLoaderService.loadSeedBundle((info) => {
        setProgress(info);
      });
      setIsSuccess(true);
      setTimeout(() => {
        setShowPrompt(false);
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      console.error('[SeedLoaderDialog] Error loading seed bundle:', err);
      setErrorMsg(err.message || 'Falha ao carregar pacote base.');
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    seedLoaderService.dismissSeedPrompt();
    setShowPrompt(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in">
      <div className="bg-surface-container-high dark:bg-slate-900 border border-outline-variant/30 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl relative">
        {!isLoading && !isSuccess && (
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container-highest transition"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-primary/10 text-primary rounded-2xl">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-on-surface dark:text-slate-100 flex items-center gap-1.5">
              Biblioteca Base Médica
              <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500" />
            </h3>
            <p className="text-xs text-on-surface-variant dark:text-slate-400">Starter Pack MedAnki</p>
          </div>
        </div>

        {isSuccess ? (
          <div className="py-6 text-center animate-in zoom-in-95">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
            <p className="font-medium text-on-surface dark:text-slate-100">Biblioteca Base Carregada!</p>
            <p className="text-xs text-on-surface-variant dark:text-slate-400 mt-1">Atualizando aplicação...</p>
          </div>
        ) : isLoading ? (
          <div className="py-4">
            <p className="text-sm font-medium text-on-surface dark:text-slate-200 mb-2">
              {progress?.stage || 'Carregando arquivos...'}
            </p>
            <div className="w-full bg-surface-container-highest dark:bg-slate-800 h-2.5 rounded-full overflow-hidden mb-2">
              <div
                className="bg-primary h-full transition-all duration-300 rounded-full"
                style={{ width: `${progress?.percent || 0}%` }}
              />
            </div>
            <p className="text-xs text-right text-on-surface-variant dark:text-slate-400">
              {progress?.percent || 0}%
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-on-surface-variant dark:text-slate-300 leading-relaxed mb-6">
              Sua biblioteca está vazia. Deseja carregar a <strong>Biblioteca Base Pré-processada</strong> com apostilas e resumos de referência médica?
              <br />
              <span className="text-xs text-on-surface-variant/80 dark:text-slate-400 block mt-2">
                • Executado 100% localmente no navegador.
                <br />
                • Não consome sua cota de IA.
              </span>
            </p>

            {errorMsg && (
              <p className="text-xs text-error font-medium mb-4 bg-error/10 p-2.5 rounded-xl border border-error/20">
                {errorMsg}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={handleDismiss}
                className="px-4 py-2.5 text-sm font-medium text-on-surface-variant dark:text-slate-300 hover:bg-surface-container-highest dark:hover:bg-slate-800 rounded-xl transition"
              >
                Agora Não
              </button>
              <button
                onClick={handleConfirm}
                className="px-5 py-2.5 text-sm font-medium bg-primary text-on-primary hover:bg-primary/90 rounded-xl shadow-xs transition flex items-center gap-1.5"
              >
                <BookOpen className="w-4 h-4" />
                Carregar Biblioteca Base
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
