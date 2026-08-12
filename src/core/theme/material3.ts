/**
 * Material 3 Design System Tokens and Color Schemes for MedAnki
 */

export type ThemeMode = 'light' | 'dark' | 'system';

export interface M3ColorScheme {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  shadow: string;
  scrim: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  // MedAnki custom semantic colors
  highYield: string;
  highYieldContainer: string;
  againColor: string;
  hardColor: string;
  goodColor: string;
  easyColor: string;
}

export const lightColorScheme: M3ColorScheme = {
  primary: '#4F46E5',
  onPrimary: '#FFFFFF',
  primaryContainer: '#EEF2FF',
  onPrimaryContainer: '#1E1B4B',
  secondary: '#6366F1',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#E0E7FF',
  onSecondaryContainer: '#312E81',
  tertiary: '#0EA5E9',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#E0F2FE',
  onTertiaryContainer: '#0369A1',
  error: '#EF4444',
  onError: '#FFFFFF',
  errorContainer: '#FEE2E2',
  onErrorContainer: '#991B1B',
  background: '#09090B',
  onBackground: '#F8FAFC',
  surface: '#121214',
  onSurface: '#F8FAFC',
  surfaceVariant: '#1A1A1E',
  onSurfaceVariant: '#94A3B8',
  outline: 'rgba(255, 255, 255, 0.1)',
  outlineVariant: 'rgba(255, 255, 255, 0.05)',
  shadow: '#000000',
  scrim: '#000000',
  inverseSurface: '#F8FAFC',
  inverseOnSurface: '#09090B',
  inversePrimary: '#818CF8',
  surfaceContainerLowest: '#09090B',
  surfaceContainerLow: '#121214',
  surfaceContainer: '#161619',
  surfaceContainerHigh: '#1C1C21',
  surfaceContainerHighest: '#242429',
  // Custom MedAnki
  highYield: '#F59E0B',
  highYieldContainer: '#451A03',
  againColor: '#EF4444',
  hardColor: '#F59E0B',
  goodColor: '#10B981',
  easyColor: '#3B82F6',
};

export const darkColorScheme: M3ColorScheme = {
  primary: '#6366F1',
  onPrimary: '#FFFFFF',
  primaryContainer: '#312E81',
  onPrimaryContainer: '#E0E7FF',
  secondary: '#818CF8',
  onSecondary: '#09090B',
  secondaryContainer: '#1E1B4B',
  onSecondaryContainer: '#C7D2FE',
  tertiary: '#38BDF8',
  onTertiary: '#09090B',
  tertiaryContainer: '#075985',
  onTertiaryContainer: '#E0F2FE',
  error: '#F87171',
  onError: '#450A0A',
  errorContainer: '#7F1D1D',
  onErrorContainer: '#FEE2E2',
  background: '#09090B',
  onBackground: '#F8FAFC',
  surface: '#121214',
  onSurface: '#F8FAFC',
  surfaceVariant: '#1A1A1E',
  onSurfaceVariant: '#94A3B8',
  outline: 'rgba(255, 255, 255, 0.1)',
  outlineVariant: 'rgba(255, 255, 255, 0.05)',
  shadow: '#000000',
  scrim: '#000000',
  inverseSurface: '#F8FAFC',
  inverseOnSurface: '#09090B',
  inversePrimary: '#4F46E5',
  surfaceContainerLowest: '#09090B',
  surfaceContainerLow: '#121214',
  surfaceContainer: '#161619',
  surfaceContainerHigh: '#1C1C21',
  surfaceContainerHighest: '#242429',
  // Custom MedAnki
  highYield: '#F59E0B',
  highYieldContainer: '#451A03',
  againColor: '#EF4444',
  hardColor: '#F59E0B',
  goodColor: '#10B981',
  easyColor: '#3B82F6',
};
