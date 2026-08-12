import React from 'react';
import { BookOpen } from 'lucide-react';

export interface MedicalEmptyProps {
  icon?: React.ReactNode;
  title?: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}

export const MedicalEmpty: React.FC<MedicalEmptyProps> = ({
  icon,
  title = 'Nenhum item encontrado',
  message = 'Sua biblioteca de estudos está vazia ou nenhum resultado corresponde ao filtro.',
  action,
  className = '',
}) => {
  return (
    <div
      className={`p-8 sm:p-12 rounded-2xl bg-[#121214] border border-white/5 text-center flex flex-col items-center justify-center space-y-4 max-w-lg mx-auto my-6 ${className}`}
    >
      <div className="w-16 h-16 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-center text-indigo-400 shrink-0 shadow-lg">
        {icon || <BookOpen className="w-8 h-8 opacity-80" />}
      </div>

      <div className="space-y-1 max-w-sm">
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{message}</p>
      </div>

      {action && <div className="pt-2">{action}</div>}
    </div>
  );
};
