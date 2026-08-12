import React from 'react';
import { useDevice } from '../../../core/responsive/DeviceContext';

export type M3ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'danger';
export type M3ButtonSize = 'sm' | 'md' | 'lg';

interface M3ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: M3ButtonVariant;
  size?: M3ButtonSize;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const M3Button: React.FC<M3ButtonProps> = ({
  variant = 'filled',
  size = 'md',
  icon,
  children,
  className = '',
  disabled,
  style,
  ...props
}) => {
  const { colors } = useDevice();

  let bg = colors.primary;
  let text = colors.onPrimary;
  let border = 'transparent';

  if (variant === 'tonal') {
    bg = colors.secondaryContainer;
    text = colors.onSecondaryContainer;
  } else if (variant === 'outlined') {
    bg = 'transparent';
    text = colors.primary;
    border = colors.outline;
  } else if (variant === 'text') {
    bg = 'transparent';
    text = colors.primary;
  } else if (variant === 'danger') {
    bg = colors.errorContainer;
    text = colors.onErrorContainer;
  }

  const paddingClasses = {
    sm: 'px-3 py-1.5 text-xs rounded-full font-medium',
    md: 'px-5 py-2.5 text-sm rounded-full font-medium',
    lg: 'px-6 py-3.5 text-base rounded-full font-semibold',
  }[size];

  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none ${paddingClasses} ${className}`}
      style={{
        backgroundColor: bg,
        color: text,
        border: border !== 'transparent' ? `1px solid ${border}` : 'none',
        boxShadow: variant === 'filled' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
        ...style,
      }}
      {...props}
    >
      {icon && <span className="inline-flex shrink-0">{icon}</span>}
      <span className="whitespace-nowrap">{children}</span>
    </button>
  );
};
