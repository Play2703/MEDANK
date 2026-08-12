import React, { useRef, useEffect } from 'react';
import { useDevice } from '../../../core/responsive/DeviceContext';
import { BookOpen, Sparkles, HelpCircle, NotebookText, BarChart3 } from 'lucide-react';

interface M3BottomBarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  dueCount?: number;
}

export const M3BottomBar: React.FC<M3BottomBarProps> = ({
  currentTab,
  onSelectTab,
  dueCount = 0,
}) => {
  const { colors, isMobileViewport } = useDevice();
  const activeTabRef = useRef<HTMLButtonElement | null>(null);

  const tabs = [
    { id: 'decks', label: 'Baralhos', icon: BookOpen, badge: dueCount },
    { id: 'ai-generator', label: 'Flashcard', icon: Sparkles },
    { id: 'questions', label: 'Questões', icon: HelpCircle },
    { id: 'notes', label: 'Notas', icon: NotebookText },
    { id: 'stats', label: 'Estatísticas', icon: BarChart3 },
  ];

  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [currentTab]);

  if (!isMobileViewport) {
    return null;
  }

  return (
    <nav
      className="sticky bottom-0 left-0 right-0 z-40 border-t py-2 px-2 sm:px-4 transition-colors w-full shrink-0"
      style={{
        backgroundColor: colors.surfaceContainerLow,
        borderColor: colors.outlineVariant,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)',
      }}
    >
      <div className="flex items-center justify-around overflow-x-auto scroll-smooth snap-x snap-mandatory no-scrollbar gap-1 sm:gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={isActive ? activeTabRef : null}
              onClick={() => onSelectTab(tab.id)}
              className="flex flex-col items-center gap-0.5 text-[10px] sm:text-xs font-medium cursor-pointer snap-center shrink-0 min-w-[70px]"
              style={{ color: isActive ? colors.primary : colors.onSurfaceVariant }}
            >
              <div
                className={`relative px-4 sm:px-5 py-1 rounded-full transition-all ${
                  isActive ? 'shadow-sm' : ''
                }`}
                style={{
                  backgroundColor: isActive ? colors.secondaryContainer : 'transparent',
                }}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                {tab.badge && tab.badge > 0 ? (
                  <span
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] sm:text-[10px] font-bold flex items-center justify-center shadow"
                    style={{ backgroundColor: colors.primary, color: colors.onPrimary }}
                  >
                    {tab.badge}
                  </span>
                ) : null}
              </div>
              <span className={`truncate ${isActive ? 'font-bold' : ''}`}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
