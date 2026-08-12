import React from 'react';
import { medAnkiColors, medAnkiBorders, medAnkiShadows } from '../../../core/theme/tokens';

export type MedButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outlined'
  | 'ghost'
  | 'highYield'
  | 'ratingAgain'
  | 'ratingHard'
  | 'ratingGood'
  | 'ratingEasy';

export type MedButtonSize = 'sm' | 'md' | 'lg';

export interface MedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: MedButtonVariant;
  size?: MedButtonSize;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const MedButton: React.FC<MedButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  fullWidth = false,
  children,
  className = '',
  disabled,
  style,
  ...props
}) => {
  let bg = medAnkiColors.primary;
  let text = medAnkiColors.onPrimary;
  let border = 'transparent';
  let shadow = 'none';

  switch (variant) {
    case 'secondary':
      bg = medAnkiColors.surfaceElevated;
      text = medAnkiColors.textPrimary;
      border = medAnkiColors.borderDefault;
      break;
    case 'outlined':
      bg = 'transparent';
      text = medAnkiColors.textPrimary;
      border = medAnkiColors.borderDefault;
      break;
    case 'ghost':
      bg = 'transparent';
      text = medAnkiColors.textSecondary;
      break;
    case 'highYield':
      bg = medAnkiColors.highYieldContainer;
      text = medAnkiColors.highYieldText;
      border = 'rgba(245, 158, 11, 0.3)';
      break;
    case 'ratingAgain':
      bg = medAnkiColors.ratingAgain;
      text = '#FFFFFF';
      shadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
      break;
    case 'ratingHard':
      bg = medAnkiColors.ratingHard;
      text = '#FFFFFF';
      shadow = '0 4px 12px rgba(245, 158, 11, 0.3)';
      break;
    case 'ratingGood':
      bg = medAnkiColors.ratingGood;
      text = '#FFFFFF';
      shadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
      break;
    case 'ratingEasy':
      bg = medAnkiColors.ratingEasy;
      text = '#FFFFFF';
      shadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
      break;
    case 'primary':
    default:
      bg = medAnkiColors.primary;
      text = medAnkiColors.onPrimary;
      shadow = medAnkiShadows.glowIndigo;
      break;
  }

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs rounded-xl font-medium',
    md: 'px-5 py-2.5 text-sm rounded-xl font-semibold',
    lg: 'px-6 py-3.5 text-base rounded-2xl font-bold',
  }[size];

  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none ${
        fullWidth ? 'w-full' : ''
      } ${sizeClasses} ${className}`}
      style={{
        backgroundColor: bg,
        color: text,
        border: border !== 'transparent' ? `1px solid ${border}` : '1px solid transparent',
        boxShadow: shadow,
        ...style,
      }}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </button>
  );
};
