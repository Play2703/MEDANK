import React from 'react';
import { medAnkiColors } from '../../../core/theme/tokens';

export interface MedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const MedInput: React.FC<MedInputProps> = ({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  className = '',
  style,
  disabled,
  ...props
}) => {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label className="text-xs font-semibold tracking-wide text-slate-300">
          {label}
        </label>
      )}

      <div className="relative flex items-center w-full">
        {leftIcon && (
          <div className="absolute left-3.5 text-slate-400 pointer-events-none flex items-center justify-center">
            {leftIcon}
          </div>
        )}

        <input
          disabled={disabled}
          className={`w-full text-sm rounded-xl px-4 py-2.5 transition-all outline-none border ${
            leftIcon ? 'pl-10' : ''
          } ${rightIcon ? 'pr-10' : ''} ${
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
        />

        {rightIcon && (
          <div className="absolute right-3.5 text-slate-400 pointer-events-none flex items-center justify-center">
            {rightIcon}
          </div>
        )}
      </div>

      {error ? (
        <span className="text-xs text-red-400 font-medium">{error}</span>
      ) : helperText ? (
        <span className="text-xs text-slate-500">{helperText}</span>
      ) : null}
    </div>
  );
};
