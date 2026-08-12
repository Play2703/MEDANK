import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

/**
 * GoRouter for MedAnki - Strongly Typed Router Implementation
 * Support routes for:
 * - Baralho ('/decks', '/study/:deckId', '/cards/:deckId')
 * - Flashcard ('/ai-generator')
 * - Estatísticas ('/stats')
 */

export type RoutePath =
  | '/decks'
  | '/study/:deckId'
  | '/cards/:deckId'
  | '/ai-generator'
  | '/questions'
  | '/stats'
  | '/notes'
  | '/notes/:noteId';

export interface RouteParamsMap {
  '/decks': Record<string, never>;
  '/study/:deckId': { deckId: string };
  '/cards/:deckId': { deckId: string };
  '/ai-generator': Record<string, never>;
  '/questions': Record<string, never>;
  '/stats': Record<string, never>;
  '/notes': Record<string, never>;
  '/notes/:noteId': { noteId: string };
}

export interface RouteLocation<P extends RoutePath = RoutePath> {
  path: P;
  params: P extends keyof RouteParamsMap ? RouteParamsMap[P] : Record<string, string>;
  fullPath: string;
}

export interface GoRouterContextType {
  location: RouteLocation;
  go: <P extends RoutePath>(
    path: P,
    ...args: RouteParamsMap[P] extends Record<string, never>
      ? [params?: RouteParamsMap[P]]
      : [params: RouteParamsMap[P]]
  ) => void;
  pop: () => void;
  canPop: boolean;
}

const defaultLocation: RouteLocation<'/decks'> = {
  path: '/decks',
  params: {},
  fullPath: '/decks',
};

const GoRouterContext = createContext<GoRouterContextType>({
  location: defaultLocation,
  go: () => {},
  pop: () => {},
  canPop: false,
});

function parseHashLocation(hash: string): RouteLocation {
  const cleanHash = hash.replace(/^#/, '') || '/decks';
  const parts = cleanHash.split('/');

  if (parts[1] === 'study' && parts[2]) {
    return {
      path: '/study/:deckId',
      params: { deckId: decodeURIComponent(parts[2]) },
      fullPath: cleanHash,
    };
  }

  if (parts[1] === 'cards' && parts[2]) {
    return {
      path: '/cards/:deckId',
      params: { deckId: decodeURIComponent(parts[2]) },
      fullPath: cleanHash,
    };
  }

  if (parts[1] === 'ai-generator') {
    return {
      path: '/ai-generator',
      params: {},
      fullPath: '/ai-generator',
    };
  }

  if (parts[1] === 'questions') {
    return {
      path: '/questions',
      params: {},
      fullPath: '/questions',
    };
  }

  if (parts[1] === 'stats') {
    return {
      path: '/stats',
      params: {},
      fullPath: '/stats',
    };
  }

  if (parts[1] === 'notes' && parts[2]) {
    return {
      path: '/notes/:noteId',
      params: { noteId: decodeURIComponent(parts[2]) },
      fullPath: cleanHash,
    };
  }

  if (parts[1] === 'notes') {
    return {
      path: '/notes',
      params: {},
      fullPath: '/notes',
    };
  }

  return {
    path: '/decks',
    params: {},
    fullPath: '/decks',
  };
}

function buildFullPath<P extends RoutePath>(path: P, params?: Record<string, string>): string {
  if (path === '/study/:deckId' && params?.deckId) {
    return `/study/${encodeURIComponent(params.deckId)}`;
  }
  if (path === '/cards/:deckId' && params?.deckId) {
    return `/cards/${encodeURIComponent(params.deckId)}`;
  }
  if (path === '/notes/:noteId' && params?.noteId) {
    return `/notes/${encodeURIComponent(params.noteId)}`;
  }
  return path;
}

export const GoRouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<RouteLocation>(() =>
    parseHashLocation(window.location.hash)
  );

  const [historyStack, setHistoryStack] = useState<RouteLocation[]>([location]);

  useEffect(() => {
    const handleHashChange = () => {
      const newLoc = parseHashLocation(window.location.hash);
      setLocation(newLoc);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const go = useCallback(
    <P extends RoutePath>(
      path: P,
      ...args: RouteParamsMap[P] extends Record<string, never>
        ? [params?: RouteParamsMap[P]]
        : [params: RouteParamsMap[P]]
    ) => {
      const params = args[0] as Record<string, string> | undefined;
      const fullPath = buildFullPath(path, params);
      const newLocation: RouteLocation<P> = {
        path,
        params: (params || {}) as RouteLocation<P>['params'],
        fullPath,
      };

      setHistoryStack((prev) => [...prev, newLocation]);
      setLocation(newLocation);
      window.location.hash = fullPath;
    },
    []
  );

  const pop = useCallback(() => {
    if (historyStack.length > 1) {
      const newStack = [...historyStack];
      newStack.pop();
      const prevLocation = newStack[newStack.length - 1];
      setHistoryStack(newStack);
      setLocation(prevLocation);
      window.location.hash = prevLocation.fullPath;
    } else {
      go('/decks');
    }
  }, [historyStack, go]);

  return (
    <GoRouterContext.Provider
      value={{
        location,
        go,
        pop,
        canPop: historyStack.length > 1,
      }}
    >
      {children}
    </GoRouterContext.Provider>
  );
};

export function useGoRouter() {
  const context = useContext(GoRouterContext);
  if (!context) {
    throw new Error('useGoRouter must be used within a GoRouterProvider');
  }
  return context;
}
