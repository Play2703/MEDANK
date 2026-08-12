import React from 'react';
import { Stethoscope } from 'lucide-react';
import { medAnkiColors } from '../../../core/theme/tokens';

export interface MedicalLoadingProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  fullScreen?: boolean;
  className?: string;
}

export const MedicalLoading: React.FC<MedicalLoadingProps> = ({
  label = 'Carregando conteúdo médico...',
  size = 'md',
  fullScreen = false,
  className = '',
}) => {
  const iconSizes = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  }[size];

  const container = (
    <div className={`flex flex-col items-center justify-center p-8 text-center space-y-4 ${className}`}>
      <div className="relative flex items-center justify-center">
        {/* Animated Pulse Halo */}
        <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
        <div className="relative p-4 bg-indigo-600/10 border border-indigo-500/30 rounded-2xl text-indigo-400">
          <Stethoscope className={`${iconSizes} animate-pulse`} />
        </div>
      </div>
      {label && (
        <p className="text-sm font-semibold text-slate-300 tracking-wide animate-pulse">
          {label}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
        style={{ backgroundColor: medAnkiColors.background }}
      >
        {container}
      </div>
    );
  }

  return container;
};
