import { useEffect, useRef, useCallback } from 'react';

interface KeyboardShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  { keys: ['/  or  ⌘K'], description: 'Search tickers' },
  { keys: ['?'], description: 'Show this help' },
  { keys: ['ESC'], description: 'Close overlay' },
  { keys: ['↑ ↓'], description: 'Navigate search results' },
  { keys: ['Enter'], description: 'Add selected ticker' },
];

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function KeyboardShortcutsHelp({ open, onClose }: KeyboardShortcutsHelpProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Capture previously focused element and auto-focus close button on open
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      // Delay to ensure the dialog is rendered
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });
    }
  }, [open]);

  // Return focus on close
  useEffect(() => {
    if (!open && previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Focus trap
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard Shortcuts"
        className="w-full max-w-sm rounded-2xl border border-border-default bg-bg-surface p-6 shadow-[0_18px_40px_rgba(0,0,0,0.28)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-text-primary">
            Keyboard Shortcuts
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

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
