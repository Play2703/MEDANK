import React from 'react';
import { medAnkiColors, medAnkiBorders, medAnkiShadows } from '../../../core/theme/tokens';

export type MedCardVariant = 'surface' | 'elevated' | 'outlined' | 'highYield';

export interface MedCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: MedCardVariant;
  clickable?: boolean;
  children: React.ReactNode;
}

export const MedCard: React.FC<MedCardProps> = ({
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

  switch (variant) {
    case 'elevated':
      bg = medAnkiColors.surfaceElevated;
      shadow = medAnkiShadows.md;
      break;
    case 'outlined':
      bg = medAnkiColors.background;
      border = medAnkiColors.borderDefault;
      break;
    case 'highYield':
      bg = medAnkiColors.surfaceHigh;
      border = 'rgba(245, 158, 11, 0.25)';
      shadow = medAnkiShadows.glowAmber;
      break;
    case 'surface':
    default:
      bg = medAnkiColors.surface;
      border = medAnkiColors.borderSubtle;
      break;
  }

  return (
    <div
      className={`rounded-2xl p-5 border transition-all duration-200 ${
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
      {children}
    </div>
  );
};
