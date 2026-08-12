import React from 'react';
import { medAnkiColors, medAnkiShadows } from '../../../core/theme/tokens';
import { MedBadge } from './MedBadge';

export interface MedicalCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  highYield?: boolean;
  badge?: string;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  variant?: 'surface' | 'elevated' | 'outlined' | 'glass';
  clickable?: boolean;
  children?: React.ReactNode;
}

export const MedicalCard: React.FC<MedicalCardProps> = ({
  title,
  subtitle,
  highYield = false,
  badge,
  headerAction,
  footer,
  variant = 'surface',
  clickable = false,
  children,
  className = '',
  style,
  ...props
}) => {
  let bg = medAnkiColors.surface;
  let border = medAnkiColors.borderDefault;
  let shadow = medAnkiShadows.none;

  if (variant === 'elevated') {
    bg = medAnkiColors.surfaceElevated;
    shadow = medAnkiShadows.md;
  } else if (variant === 'outlined') {
    bg = medAnkiColors.background;
    border = medAnkiColors.borderDefault;
  } else if (variant === 'glass') {
    bg = 'rgba(18, 18, 20, 0.7)';
    border = 'rgba(255, 255, 255, 0.08)';
  }

  if (highYield) {
    border = 'rgba(245, 158, 11, 0.3)';
  }

  return (
    <div
      className={`rounded-2xl p-5 border flex flex-col justify-between transition-all duration-200 ${
        clickable ? 'cursor-pointer hover:border-indigo-500/40 hover:bg-[#161619] active:scale-[0.99]' : ''
      } ${className}`}
      style={{
        backgroundColor: bg,
        borderColor: border,
        boxShadow: shadow,
        ...style,
      }}
      {...props}
    >
      {(title || subtitle || badge || highYield || headerAction) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {highYield && <MedBadge variant="highYield">High Yield</MedBadge>}
              {badge && !highYield && <MedBadge variant="primary">{badge}</MedBadge>}
            </div>
            {title && (
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs sm:text-sm text-slate-400 font-normal">
                {subtitle}
              </p>
            )}
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </div>
      )}

      {children && <div className="flex-1">{children}</div>}

      {footer && (
        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
          {footer}
        </div>
      )}
    </div>
  );
};
