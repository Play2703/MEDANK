import React from 'react';
import { useDevice } from '../../../core/responsive/DeviceContext';

export type M3CardVariant = 'elevated' | 'filled' | 'outlined';

interface M3CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: M3CardVariant;
  children: React.ReactNode;
  clickable?: boolean;
}

export const M3Card: React.FC<M3CardProps> = ({
  variant = 'filled',
  children,
  clickable = false,
  className = '',
  style,
  ...props
}) => {
  const { colors } = useDevice();

  let bg = '#121214';
  let border = 'rgba(255, 255, 255, 0.08)';
  let shadow = 'none';

  if (variant === 'elevated') {
    bg = '#161619';
    shadow = '0 10px 30px -10px rgba(0,0,0,0.5)';
  } else if (variant === 'filled') {
    bg = '#121214';
  } else if (variant === 'outlined') {
    bg = '#09090B';
    border = 'rgba(255, 255, 255, 0.1)';
  }

  return (
    <div
      className={`M3Card rounded-2xl p-5 transition-all duration-200 border ${
        clickable ? 'cursor-pointer hover:border-indigo-500/40 hover:bg-[#161619]' : ''
      } ${className}`}
      style={{
        backgroundColor: bg,
        color: colors.onSurface,
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
