import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDevice } from '../../core/responsive/DeviceContext';
import { Shield, Lock, Eye, EyeOff, X, ArrowRight, AlertTriangle } from 'lucide-react';
import { useDeveloperConsoleViewModel } from '../viewmodels/useDeveloperConsoleViewModel';

export const DeveloperAuthDialog: React.FC = () => {
  const { colors } = useDevice();
  const {
    isAuthDialogOpen,
    closeAuthDialog,
    pinInput,
    setPinInput,
    showPin,
    toggleShowPin,
    submitPin,
    errorMessage,
    lockoutState,
    remainingLockoutSeconds,
  } = useDeveloperConsoleViewModel();

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAuthDialogOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isAuthDialogOpen]);

  if (!isAuthDialogOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutState.isBlocked && remainingLockoutSeconds > 0) return;
    submitPin();
  };

  const formatLockoutTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  const isBlocked = lockoutState.isBlocked && remainingLockoutSeconds > 0;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-md rounded-3xl p-6 border shadow-2xl relative space-y-5"
          style={{
            backgroundColor: colors.surfaceContainer,
            borderColor: colors.outlineVariant,
            color: colors.onSurface,
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center font-bold shrink-0"
                style={{
                  backgroundColor: colors.primaryContainer,
                  color: colors.onPrimaryContainer,
                }}
              >
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold tracking-tight">Developer Console</h3>
                <p className="text-xs opacity-75">Área restrita ao desenvolvedor.</p>
              </div>
            </div>

            <button
              onClick={closeAuthDialog}
              className="p-2 rounded-full hover:bg-white/10 transition-colors opacity-70 hover:opacity-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {isBlocked ? (
              <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Acesso Bloqueado Temporariamente</span>
                </div>
                <p className="leading-relaxed opacity-90">
                  Devido a múltiplas tentativas incorretas, o painel foi bloqueado.
                </p>
                <div className="text-center font-mono font-bold text-sm text-rose-200 pt-1">
                  Tempo restante: {formatLockoutTime(remainingLockoutSeconds)}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-semibold opacity-80 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Informe o PIN de Desenvolvedor</span>
                </label>
                <div className="relative">
                  <input
                    ref={inputRef}
                    type={showPin ? 'text' : 'password'}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder="••••••••"
                    autoFocus
                    className="w-full px-4 py-3 rounded-2xl border text-sm font-mono tracking-widest outline-none transition-all pr-12 focus:border-indigo-500"
                    style={{
                      backgroundColor: colors.surfaceContainerLow,
                      borderColor: colors.outlineVariant,
                      color: colors.onSurface,
                    }}
                  />
                  <button
                    type="button"
                    onClick={toggleShowPin}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-xl hover:bg-white/10 opacity-70 hover:opacity-100 transition-colors"
                  >
                    {showPin ? (
                      <EyeOff className="w-4 h-4 text-slate-400" />
                    ) : (
                      <Eye className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Strict Error Message */}
            {errorMessage && !isBlocked && (
              <div className="text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl">
                {errorMessage}
              </div>
            )}

            {/* Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeAuthDialog}
                className="px-4 py-2.5 rounded-2xl text-xs font-bold transition-colors border border-transparent hover:border-white/10"
                style={{ color: colors.onSurfaceVariant }}
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isBlocked || !pinInput.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  backgroundColor: colors.primary,
                  color: colors.onPrimary,
                }}
              >
                <span>Entrar</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
