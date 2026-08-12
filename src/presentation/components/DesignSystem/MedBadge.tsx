import React from 'react';
import { medAnkiColors } from '../../../core/theme/tokens';

export type MedBadgeVariant = 'primary' | 'secondary' | 'highYield' | 'success' | 'warning' | 'error' | 'info';

export interface MedBadgeProps {
  variant?: MedBadgeVariant;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export const MedBadge: React.FC<MedBadgeProps> = ({
  variant = 'primary',
  children,
  icon,
  className = '',
}) => {
  let bg = medAnkiColors.primaryContainer;
  let text = medAnkiColors.primary;

  switch (variant) {
    case 'secondary':
      bg = 'rgba(255, 255, 255, 0.08)';
      text = medAnkiColors.textSecondary;
      break;
    case 'highYield':
      bg = medAnkiColors.highYieldContainer;
      text = medAnkiColors.highYieldText;
      break;
    case 'success':
      bg = 'rgba(16, 185, 129, 0.15)';
      text = '#34D399';
      break;
    case 'warning':
      bg = 'rgba(245, 158, 11, 0.15)';
      text = '#FBBF24';
      break;
    case 'error':
      bg = 'rgba(239, 68, 68, 0.15)';
      text = '#F87171';
      break;
    case 'info':
      bg = 'rgba(56, 189, 248, 0.15)';
      text = '#38BDF8';
      break;
    case 'primary':
    default:
      bg = 'rgba(79, 70, 229, 0.15)';
      text = '#818CF8';
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${className}`}
      style={{ backgroundColor: bg, color: text }}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
};
