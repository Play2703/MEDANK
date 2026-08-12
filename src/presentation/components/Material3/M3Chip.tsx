import React from 'react';
import { useDevice } from '../../../core/responsive/DeviceContext';

interface M3ChipProps {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
  variant?: 'filter' | 'highyield' | 'tag';
}

export const M3Chip: React.FC<M3ChipProps> = ({
  label,
  selected = false,
  onClick,
  icon,
  variant = 'tag',
}) => {
  const { colors } = useDevice();

  let bg = colors.surfaceContainerHigh;
  let text = colors.onSurfaceVariant;
  let border = colors.outlineVariant;

  if (selected) {
    bg = colors.secondaryContainer;
    text = colors.onSecondaryContainer;
    border = 'transparent';
  }

  if (variant === 'highyield') {
    bg = colors.highYieldContainer;
    text = colors.highYield;
    border = 'transparent';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap select-none"
      style={{
        backgroundColor: bg,
        color: text,
        border: border !== 'transparent' ? `1px solid ${border}` : 'none',
      }}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{label}</span>
    </button>
  );
};
