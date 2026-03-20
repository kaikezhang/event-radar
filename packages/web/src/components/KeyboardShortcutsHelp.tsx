import { useEffect, useRef } from 'react';

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  { keys: ['/  or  ⌘K'], description: 'Search tickers' },
  { keys: ['?'], description: 'Show this help' },
  { keys: ['ESC'], description: 'Close overlay / deselect event' },
  { keys: ['↑ ↓'], description: 'Navigate search results' },
  { keys: ['Enter'], description: 'Add selected ticker' },
  { keys: ['j / k'], description: 'Navigate feed (desktop)' },
];

export function KeyboardShortcutsHelp({ open, onClose }: KeyboardShortcutsHelpProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border-default bg-bg-surface p-6 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
        <h2 className="text-[15px] font-semibold text-text-primary">
          Keyboard Shortcuts
        </h2>

        <div className="mt-4 space-y-3">
          {shortcuts.map((s) => (
            <div key={s.description} className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">{s.description}</span>
              <kbd className="rounded-md border border-border-default bg-bg-elevated px-2 py-0.5 font-mono text-xs text-text-primary">
                {s.keys[0]}
              </kbd>
            </div>
          ))}
        </div>

        <p className="mt-5 text-center text-xs text-text-tertiary">
          Press <kbd className="rounded border border-border-default bg-bg-elevated px-1 py-0.5 font-mono text-[10px]">ESC</kbd> to close
        </p>
      </div>
    </div>
  );
}
