import React from 'react';
import * as LucideIcons from 'lucide-react';
import { medAnkiIcons } from '../../../core/theme/tokens';

export type MedIconName = keyof typeof LucideIcons;

export interface MedIconProps {
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | number;
  color?: string;
  className?: string;
}

export const MedIcon: React.FC<MedIconProps> = ({
  name,
  size = 'md',
  color,
  className = '',
}) => {
  const IconComponent = (LucideIcons as any)[name] || LucideIcons.HelpCircle;

  let computedSize = 20;
  if (typeof size === 'number') {
    computedSize = size;
  } else {
    computedSize = medAnkiIcons.sizes[size] || 20;
  }

  return <IconComponent size={computedSize} color={color} className={className} />;
};
