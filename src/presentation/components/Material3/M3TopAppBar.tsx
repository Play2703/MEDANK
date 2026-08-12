import React from 'react';
import { Capacitor } from '@capacitor/core';
import { useDevice, DeviceMode } from '../../../core/responsive/DeviceContext';
import { useDeveloperConsoleViewModel } from '../../../developer_console';
import {
  Stethoscope,
  Sun,
  Moon,
  Smartphone,
  Tablet,
  Monitor,
  Sparkles,
  BarChart3,
  BookOpen,
  HelpCircle,
  NotebookText,
} from 'lucide-react';

interface M3TopAppBarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  dueCount?: number;
}

export const M3TopAppBar: React.FC<M3TopAppBarProps> = ({
  currentTab,
  onSelectTab,
  dueCount = 0,
}) => {
  const { colors, isDark, setThemeMode, deviceMode, setDeviceMode, isMobileViewport } = useDevice();
  const { handleSecretTap } = useDeveloperConsoleViewModel();

  return (
    <header
      className="sticky top-0 z-40 px-3 sm:px-4 py-2.5 sm:py-3 border-b transition-colors"
      style={{
        backgroundColor: colors.surfaceContainerLow,
        borderColor: colors.outlineVariant,
        color: colors.onSurface,
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.625rem)',
      }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
        {/* Brand & Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center font-bold shadow-sm shrink-0"
            style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
          >
            <Stethoscope className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-base sm:text-lg font-bold tracking-tight">MedAnki</h1>
              {!isMobileViewport && (
                <span
                  onClick={handleSecretTap}
                  className="hidden sm:inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider select-none cursor-pointer"
                  style={{ backgroundColor: colors.secondaryContainer, color: colors.onSecondaryContainer }}
                >
                  M3 Clean Arch
                </span>
              )}
            </div>
            {!isMobileViewport && (
              <p className="text-[10px] sm:text-xs truncate" style={{ color: colors.onSurfaceVariant }}>
                Plataforma Médica de Repetição Espaçada
              </p>
            )}
          </div>
        </div>

        {/* Center Navigation Tabs - ONLY rendered when NOT in mobile viewport */}
        {!isMobileViewport && (
          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => onSelectTab('decks')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                currentTab === 'decks' ? 'shadow-sm' : ''
              }`}
              style={{
                backgroundColor: currentTab === 'decks' ? colors.secondaryContainer : 'transparent',
                color: currentTab === 'decks' ? colors.onSecondaryContainer : colors.onSurfaceVariant,
              }}
            >
              <BookOpen className="w-4 h-4" />
              <span>Baralhos</span>
              {dueCount > 0 && (
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
                >
                  {dueCount}
                </span>
              )}
            </button>

            <button
              onClick={() => onSelectTab('ai-generator')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                currentTab === 'ai-generator' ? 'shadow-sm' : ''
              }`}
              style={{
                backgroundColor: currentTab === 'ai-generator' ? colors.secondaryContainer : 'transparent',
                color: currentTab === 'ai-generator' ? colors.onSecondaryContainer : colors.onSurfaceVariant,
              }}
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Flashcard</span>
            </button>

            <button
              onClick={() => onSelectTab('questions')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                currentTab === 'questions' ? 'shadow-sm' : ''
              }`}
              style={{
                backgroundColor: currentTab === 'questions' ? colors.secondaryContainer : 'transparent',
                color: currentTab === 'questions' ? colors.onSecondaryContainer : colors.onSurfaceVariant,
              }}
            >
              <HelpCircle className="w-4 h-4 text-indigo-400" />
              <span>Questões</span>
            </button>

            <button
              onClick={() => onSelectTab('notes')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                currentTab === 'notes' ? 'shadow-sm' : ''
              }`}
              style={{
                backgroundColor: currentTab === 'notes' ? colors.secondaryContainer : 'transparent',
                color: currentTab === 'notes' ? colors.onSecondaryContainer : colors.onSurfaceVariant,
              }}
            >
              <NotebookText className="w-4 h-4 text-emerald-400" />
              <span>Notas</span>
            </button>

            <button
              onClick={() => onSelectTab('stats')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                currentTab === 'stats' ? 'shadow-sm' : ''
              }`}
              style={{
                backgroundColor: currentTab === 'stats' ? colors.secondaryContainer : 'transparent',
                color: currentTab === 'stats' ? colors.onSecondaryContainer : colors.onSurfaceVariant,
              }}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Estatísticas</span>
            </button>
          </nav>
        )}

        {/* Actions & Responsive Emulator Switcher */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Help / Dev Console Secret Button for Mobile */}
          {isMobileViewport && (
            <button
              onClick={handleSecretTap}
              className="p-1.5 rounded-full hover:bg-white/10 text-indigo-400 transition-colors"
              title="Console Developer"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          )}

          {/* Viewport Frame Switcher (iPhone, iPad, Desktop) - HIDE on native app */}
          {!Capacitor.isNativePlatform() && (
            <div
              className="flex items-center p-1 rounded-full border text-xs"
              style={{ borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainer }}
            >
              <button
                onClick={() => setDeviceMode('fluid')}
                title="Layout Fluido (Web)"
                className="p-1.5 rounded-full transition-colors"
                style={{
                  backgroundColor: deviceMode === 'fluid' ? colors.primaryContainer : 'transparent',
                  color: deviceMode === 'fluid' ? colors.onPrimaryContainer : colors.onSurfaceVariant,
                }}
              >
                <Monitor className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDeviceMode('iphone')}
                title="Simulador iPhone 15 Pro"
                className="p-1.5 rounded-full transition-colors"
                style={{
                  backgroundColor: deviceMode === 'iphone' ? colors.primaryContainer : 'transparent',
                  color: deviceMode === 'iphone' ? colors.onPrimaryContainer : colors.onSurfaceVariant,
                }}
              >
                <Smartphone className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDeviceMode('ipad')}
                title="Simulador iPad Air"
                className="p-1.5 rounded-full transition-colors"
                style={{
                  backgroundColor: deviceMode === 'ipad' ? colors.primaryContainer : 'transparent',
                  color: deviceMode === 'ipad' ? colors.onPrimaryContainer : colors.onSurfaceVariant,
                }}
              >
                <Tablet className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Theme Dark / Light toggle */}
          <button
            onClick={() => setThemeMode(isDark ? 'light' : 'dark')}
            title="Alternar Tema Material 3"
            className="p-1.5 sm:p-2 rounded-full transition-colors"
            style={{ backgroundColor: colors.surfaceContainerHigh, color: colors.onSurface }}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </button>
        </div>
      </div>
    </header>
  );
};
