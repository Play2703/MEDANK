/**
 * MedAnki Design System - Core Tokens
 * Elegant Dark Theme & Medical Anki Aesthetics
 */

export const medAnkiColors = {
  // Base Palette
  background: '#09090B', // Dark charcoal/slate backdrop
  surface: '#121214',    // Main elevation card surface
  surfaceElevated: '#161619', // Elevated interactive surface
  surfaceHigh: '#1C1C21',     // High-priority highlight surface
  surfaceHighest: '#242429',  // Hover / modal active surface

  // Brand Accents
  primary: '#4F46E5',        // Indigo 600
  primaryHover: '#6366F1',   // Indigo 500
  primaryContainer: '#1E1B4B', // Deep indigo container
  onPrimary: '#FFFFFF',

  secondary: '#818CF8',      // Light indigo
  secondaryContainer: '#312E81',

  tertiary: '#0EA5E9',       // Cyan accent
  tertiaryContainer: '#075985',

  // High Yield & Medical Badges
  highYield: '#F59E0B',      // Amber gold
  highYieldContainer: '#451A03',
  highYieldText: '#FBBF24',

  // SM-2 Review Ratings
  ratingAgain: '#EF4444',    // Red 500
  ratingHard: '#F59E0B',     // Amber 500
  ratingGood: '#10B981',     // Emerald 500
  ratingEasy: '#3B82F6',     // Blue 500

  // Neutral Text
  textPrimary: '#F8FAFC',    // Slate 50
  textSecondary: '#94A3B8',  // Slate 400
  textMuted: '#64748B',      // Slate 500
  textDisabled: '#475569',   // Slate 600

  // Status & Alerts
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Borders & Dividers
  borderSubtle: 'rgba(255, 255, 255, 0.06)',
  borderDefault: 'rgba(255, 255, 255, 0.10)',
  borderActive: 'rgba(99, 102, 241, 0.40)', // Indigo border glow
  borderFocus: '#6366F1',
};

export const medAnkiTypography = {
  fontFamily: {
    sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem',// 30px
    '4xl': '2.25rem', // 36px
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    black: 900,
  },
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0em',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
};

export const medAnkiSpacing = {
  xs: '0.25rem',  // 4px
  sm: '0.5rem',   // 8px
  md: '1rem',     // 16px
  lg: '1.5rem',   // 24px
  xl: '2rem',     // 32px
  '2xl': '3rem',  // 48px
  '3xl': '4rem',  // 64px
};

export const medAnkiBorders = {
  radius: {
    none: '0px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    full: '9999px',
  },
  width: {
    none: '0px',
    thin: '1px',
    thick: '2px',
  },
};

export const medAnkiShadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
  md: '0 4px 12px -2px rgba(0, 0, 0, 0.4)',
  lg: '0 10px 25px -5px rgba(0, 0, 0, 0.6)',
  glowIndigo: '0 0 20px rgba(79, 70, 229, 0.25)',
  glowEmerald: '0 0 20px rgba(16, 185, 129, 0.25)',
  glowAmber: '0 0 20px rgba(245, 158, 11, 0.25)',
};

export const medAnkiAnimations = {
  duration: {
    fast: '150ms',
    normal: '250ms',
    slow: '400ms',
  },
  easing: {
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  presets: {
    fadeIn: 'transition-opacity duration-200 ease-in-out',
    scaleUp: 'transition-transform duration-200 cubic-bezier(0.34, 1.56, 0.64, 1)',
    cardHover: 'transition-all duration-200 hover:border-indigo-500/40 hover:bg-[#161619]',
    buttonActive: 'active:scale-95 transition-transform duration-150',
  },
};

export const medAnkiIcons = {
  sizes: {
    sm: 16,
    md: 20,
    lg: 24,
    xl: 32,
  },
};

export const medAnkiButtons = {
  variants: ['filled', 'tonal', 'outlined', 'ghost', 'highYield', 'ratingAgain', 'ratingHard', 'ratingGood', 'ratingEasy'],
  sizes: ['sm', 'md', 'lg'],
};

export const medAnkiCards = {
  variants: ['filled', 'elevated', 'outlined', 'highYield'],
};

export const medAnkiInputs = {
  sizes: ['sm', 'md', 'lg'],
};

export const medAnkiDropdowns = {
  variants: ['default', 'outlined'],
};

export const MedAnkiDesignSystem = {
  colors: medAnkiColors,
  typography: medAnkiTypography,
  spacing: medAnkiSpacing,
  borders: medAnkiBorders,
  shadows: medAnkiShadows,
  animations: medAnkiAnimations,
  icons: medAnkiIcons,
  buttons: medAnkiButtons,
  cards: medAnkiCards,
  inputs: medAnkiInputs,
  dropdowns: medAnkiDropdowns,
};
