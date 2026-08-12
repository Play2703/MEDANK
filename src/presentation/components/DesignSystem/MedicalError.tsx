import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { PrimaryButton } from './PrimaryButton';

export interface MedicalErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export const MedicalError: React.FC<MedicalErrorProps> = ({
  title = 'Erro ao carregar dados',
  message = 'Ocorreu um problema inesperado ao processar sua solicitação médica.',
  onRetry,
  retryLabel = 'Tentar novamente',
  className = '',
}) => {
  return (
    <div
      className={`p-6 sm:p-8 rounded-2xl bg-red-950/20 border border-red-500/20 text-center flex flex-col items-center justify-center space-y-4 max-w-md mx-auto my-6 ${className}`}
    >
      <div className="w-12 h-12 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center text-red-400 shrink-0">
        <AlertTriangle className="w-6 h-6" />
      </div>

      <div className="space-y-1">
        <h3 className="text-base sm:text-lg font-bold text-white">{title}</h3>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{message}</p>
      </div>

      {onRetry && (
        <PrimaryButton
          variant="indigo"
          size="sm"
          icon={<RefreshCw className="w-4 h-4" />}
          onClick={onRetry}
        >
          {retryLabel}
        </PrimaryButton>
      )}
    </div>
  );
};
