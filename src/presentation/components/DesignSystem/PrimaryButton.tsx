import React from 'react';
import { Loader2 } from 'lucide-react';
import { medAnkiColors, medAnkiShadows } from '../../../core/theme/tokens';

export interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  icon?: React.ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'indigo' | 'highYield' | 'emerald';
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  children,
  icon,
  loading = false,
  fullWidth = false,
  size = 'md',
  variant = 'indigo',
  disabled,
  className = '',
  style,
  ...props
}) => {
  let bg = medAnkiColors.primary;
  let shadow = medAnkiShadows.glowIndigo;

  if (variant === 'highYield') {
    bg = medAnkiColors.highYield;
    shadow = medAnkiShadows.glowAmber;
  } else if (variant === 'emerald') {
    bg = medAnkiColors.success;
    shadow = medAnkiShadows.glowEmerald;
  }

  const sizeClasses = {
    sm: 'px-3.5 py-2 text-xs rounded-xl font-medium min-h-[36px]',
    md: 'px-5 py-2.5 text-sm rounded-xl font-semibold min-h-[44px]',
    lg: 'px-7 py-3.5 text-base rounded-2xl font-bold min-h-[52px]',
  }[size];

  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 text-white transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none ${
        fullWidth ? 'w-full' : ''
      } ${sizeClasses} ${className}`}
      style={{
        backgroundColor: bg,
        boxShadow: shadow,
        ...style,
      }}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      <span>{children}</span>
    </button>
  );
};
