import React from 'react';
import { Loader2 } from 'lucide-react';
import { medAnkiColors } from '../../../core/theme/tokens';

export interface SecondaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  icon?: React.ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  outlined?: boolean;
}

export const SecondaryButton: React.FC<SecondaryButtonProps> = ({
  children,
  icon,
  loading = false,
  fullWidth = false,
  size = 'md',
  outlined = false,
  disabled,
  className = '',
  style,
  ...props
}) => {
  const sizeClasses = {
    sm: 'px-3.5 py-2 text-xs rounded-xl font-medium min-h-[36px]',
    md: 'px-5 py-2.5 text-sm rounded-xl font-semibold min-h-[44px]',
    lg: 'px-7 py-3.5 text-base rounded-2xl font-bold min-h-[52px]',
  }[size];

  const bg = outlined ? 'transparent' : medAnkiColors.surfaceElevated;
  const border = outlined ? medAnkiColors.borderDefault : medAnkiColors.borderSubtle;

  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 text-slate-200 transition-all duration-200 hover:bg-[#1C1C21] hover:text-white border active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none ${
        fullWidth ? 'w-full' : ''
      } ${sizeClasses} ${className}`}
      style={{
        backgroundColor: bg,
        borderColor: border,
        ...style,
      }}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0 text-slate-400" />
      ) : icon ? (
        <span className="shrink-0 text-slate-400">{icon}</span>
      ) : null}
      <span>{children}</span>
    </button>
  );
};
