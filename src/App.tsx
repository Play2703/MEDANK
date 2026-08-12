import React, { Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DeviceProvider, useDevice } from './core/responsive/DeviceContext';
import { DeviceFrame } from './presentation/components/DeviceFrame/DeviceFrame';
import { M3TopAppBar } from './presentation/components/Material3/M3TopAppBar';
import { M3BottomBar } from './presentation/components/Material3/M3BottomBar';
import { MedicalLoading } from './presentation/components/DesignSystem/MedicalLoading';
import { DeckListView } from './presentation/views/DeckList/DeckListView';
import { DeveloperAuthDialog } from './developer_console';
import { useDeckViewModel } from './presentation/viewmodels/useDeckViewModel';
import { GoRouterProvider, useGoRouter } from './core/router';

import { SeedLoaderDialog } from './presentation/components/SeedLoaderDialog';

// Lazy loading for heavy and secondary views (code-splitting)
const StudySessionView = lazy(() =>
  import('./presentation/views/StudySession/StudySessionView').then((m) => ({ default: m.StudySessionView }))
);
const CardManagerView = lazy(() =>
  import('./presentation/views/CardManager/CardManagerView').then((m) => ({ default: m.CardManagerView }))
);
const AIGeneratorView = lazy(() =>
  import('./presentation/views/AIGenerator/AIGeneratorView').then((m) => ({ default: m.AIGeneratorView }))
);
const QuestionsView = lazy(() =>
  import('./presentation/views/Questions/QuestionsView').then((m) => ({ default: m.QuestionsView }))
);
const NotesView = lazy(() =>
  import('./presentation/views/Notes/NotesView').then((m) => ({ default: m.NotesView }))
);
const StatsView = lazy(() =>
  import('./presentation/views/Stats/StatsView').then((m) => ({ default: m.StatsView }))
);
const DeveloperConsoleView = lazy(() =>
  import('./developer_console/views/DeveloperConsoleView').then((m) => ({ default: m.DeveloperConsoleView }))
);

const MAIN_TABS = ['decks', 'ai-generator', 'questions', 'notes', 'stats'];

function MainAppContent() {
  const { location, go } = useGoRouter();
  const { totalDueCards, refreshDecks } = useDeckViewModel();
  const { isMobileViewport } = useDevice();

  const handleStartStudy = (deckId: string) => {
    go('/study/:deckId', { deckId });
  };

  const handleManageCards = (deckId: string) => {
    go('/cards/:deckId', { deckId });
  };

  const handleBackToDecks = async () => {
    go('/decks');
    await refreshDecks();
  };

  // Map location path to active tab identifier for TopAppBar and BottomBar
  const currentTab =
    location.path === '/ai-generator'
      ? 'ai-generator'
      : location.path === '/questions'
      ? 'questions'
      : location.path === '/notes' || location.path.startsWith('/notes')
      ? 'notes'
      : location.path === '/stats'
      ? 'stats'
      : 'decks';

  const handleSelectTab = (tab: string) => {
    if (tab === 'ai-generator') {
      go('/ai-generator');
    } else if (tab === 'questions') {
      go('/questions');
    } else if (tab === 'notes') {
      go('/notes');
    } else if (tab === 'stats') {
      go('/stats');
    } else {
      go('/decks');
    }
  };

  const isMainTabRoute = ['/decks', '/ai-generator', '/questions', '/notes', '/stats'].includes(location.path);

  const handleDragEnd = (_: any, info: { offset: { x: number } }) => {
    if (!isMainTabRoute) return;
    const swipeThreshold = 50;
    const currentIndex = MAIN_TABS.indexOf(currentTab);
    if (currentIndex === -1) return;

    if (info.offset.x < -swipeThreshold && currentIndex < MAIN_TABS.length - 1) {
      // Swiped left -> Next tab
      handleSelectTab(MAIN_TABS[currentIndex + 1]);
    } else if (info.offset.x > swipeThreshold && currentIndex > 0) {
      // Swiped right -> Previous tab
      handleSelectTab(MAIN_TABS[currentIndex - 1]);
    }
  };

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <M3TopAppBar
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        dueCount={totalDueCards}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 pt-4 sm:pt-6 pb-20 md:pb-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.path}
            drag={isMainTabRoute && isMobileViewport ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -15 }}
            transition={{ duration: 0.18 }}
            className="w-full h-full"
          >
            <Suspense fallback={<MedicalLoading label="Carregando visualização..." />}>
              {location.path === '/decks' && (
                <DeckListView
                  onStartStudy={handleStartStudy}
                  onManageCards={handleManageCards}
                />
              )}

              {location.path === '/study/:deckId' && 'deckId' in location.params && location.params.deckId && (
                <StudySessionView
                  deckId={location.params.deckId}
                  onBack={handleBackToDecks}
                />
              )}

              {location.path === '/cards/:deckId' && 'deckId' in location.params && location.params.deckId && (
                <CardManagerView
                  deckId={location.params.deckId}
                  onBack={handleBackToDecks}
                />
              )}

              {location.path === '/ai-generator' && (
                <AIGeneratorView
                  onSuccessNavigateToDeck={(deckId) => {
                    go('/study/:deckId', { deckId });
                  }}
                />
              )}

              {location.path === '/questions' && <QuestionsView />}

              {(location.path === '/notes' || location.path === '/notes/:noteId') && <NotesView />}

              {location.path === '/stats' && <StatsView />}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile M3 Bottom Navigation */}
      {location.path !== '/study/:deckId' && (
        <M3BottomBar
          currentTab={currentTab}
          onSelectTab={handleSelectTab}
          dueCount={totalDueCards}
        />
      )}

      {/* Seed Loader Dialog for initial library setup */}
      <SeedLoaderDialog />

      {/* Hidden Developer Console Auth Dialog & View */}
      <DeveloperAuthDialog />
      <Suspense fallback={null}>
        <DeveloperConsoleView />
      </Suspense>
    </div>
  );
}

export default function App() {
  return (
    <DeviceProvider>
      <DeviceFrame>
        <GoRouterProvider>
          <MainAppContent />
        </GoRouterProvider>
      </DeviceFrame>
    </DeviceProvider>
  );
}
