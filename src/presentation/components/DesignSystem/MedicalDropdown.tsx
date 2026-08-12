import React from 'react';
import { ChevronDown } from 'lucide-react';
import { medAnkiColors } from '../../../core/theme/tokens';

export interface MedicalDropdownOption {
  value: string;
  label: string;
}

export interface MedicalDropdownProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: MedicalDropdownOption[];
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
}

export const MedicalDropdown: React.FC<MedicalDropdownProps> = ({
  label,
  options,
  error,
  helperText,
  fullWidth = true,
  className = '',
  style,
  disabled,
  ...props
}) => {
  return (
    <div className={`flex flex-col gap-1.5 ${fullWidth ? 'w-full' : 'w-auto'}`}>
      {label && (
        <label className="text-xs font-semibold tracking-wide text-slate-300">
          {label}
        </label>
      )}

      <div className="relative flex items-center w-full">
        <select
          disabled={disabled}
          className={`w-full text-sm rounded-xl px-4 py-2.5 pr-10 appearance-none transition-all outline-none border cursor-pointer ${
            error
              ? 'border-red-500 focus:ring-2 focus:ring-red-500/20'
              : 'border-white/10 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
          } disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
          style={{
            backgroundColor: medAnkiColors.surfaceElevated,
            color: medAnkiColors.textPrimary,
            ...style,
          }}
          {...props}
        >
          {options.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              style={{
                backgroundColor: medAnkiColors.surface,
                color: medAnkiColors.textPrimary,
              }}
            >
              {opt.label}
            </option>
          ))}
        </select>

        <ChevronDown className="absolute right-3.5 w-4 h-4 text-slate-400 pointer-events-none shrink-0" />
      </div>

      {error ? (
        <span className="text-xs text-red-400 font-medium">{error}</span>
      ) : helperText ? (
        <span className="text-xs text-slate-500">{helperText}</span>
      ) : null}
    </div>
  );
};
