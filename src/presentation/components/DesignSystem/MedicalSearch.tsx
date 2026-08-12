import React from 'react';
import { Search, X } from 'lucide-react';
import { medAnkiColors } from '../../../core/theme/tokens';

export interface MedicalSearchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  fullWidth?: boolean;
}

export const MedicalSearch: React.FC<MedicalSearchProps> = ({
  value,
  onChange,
  onClear,
  placeholder = 'Buscar baralhos, temas ou flashcards...',
  fullWidth = true,
  className = '',
  style,
  disabled,
  ...props
}) => {
  const handleClear = () => {
    onChange('');
    if (onClear) onClear();
  };

  return (
    <div className={`relative flex items-center ${fullWidth ? 'w-full' : 'w-auto'}`}>
      <Search className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none shrink-0" />
      
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={`w-full text-sm rounded-xl pl-10 pr-9 py-2.5 transition-all outline-none border border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        style={{
          backgroundColor: medAnkiColors.surfaceElevated,
          color: medAnkiColors.textPrimary,
          ...style,
        }}
        {...props}
      />

      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          title="Limpar busca"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
