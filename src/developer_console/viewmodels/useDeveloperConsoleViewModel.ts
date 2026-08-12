import { useState, useEffect } from 'react';
import { DeveloperConsoleStore, DeveloperConsoleState } from './developerConsoleRiverpodStore';

export function useDeveloperConsoleViewModel() {
  const store = DeveloperConsoleStore.getInstance();
  const [state, setState] = useState<DeveloperConsoleState>(store.getState());

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      setState(store.getState());
    });
    return unsubscribe;
  }, [store]);

  return {
    ...state,
    handleSecretTap: () => store.handleSecretTap(),
    openAuthDialog: () => store.openAuthDialog(),
    closeAuthDialog: () => store.closeAuthDialog(),
    setPinInput: (val: string) => store.setPinInput(val),
    toggleShowPin: () => store.toggleShowPin(),
    submitPin: () => store.submitPin(),
    closeConsoleView: () => store.closeConsoleView(),
    changePin: (current: string, next: string) => store.changePin(current, next),
  };
}
