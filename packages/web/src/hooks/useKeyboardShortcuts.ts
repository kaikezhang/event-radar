import { useEffect } from 'react';

interface ShortcutHandlers {
  onShowHelp: () => void;
}

export function useKeyboardShortcuts({ onShowHelp }: ShortcutHandlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onShowHelp();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onShowHelp]);
}
