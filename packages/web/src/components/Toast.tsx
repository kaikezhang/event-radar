import { useEffect, useRef } from 'react';

interface ToastProps {
  message: string;
  visible: boolean;
  onDismiss: () => void;
  duration?: number;
}

export function Toast({ message, visible, onDismiss, duration = 2000 }: ToastProps) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => onDismissRef.current(), duration);
    return () => clearTimeout(timer);
  }, [visible, duration]);

  return (
    <div
      className="fixed inset-x-0 z-40 flex justify-center pointer-events-none"
      style={{ bottom: `calc(4.5rem + env(safe-area-inset-bottom, 0px))` }}
    >
      <div
        className={`pointer-events-auto rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-all duration-300 ease-out ${
          visible
            ? 'translate-y-0 opacity-100'
            : 'translate-y-4 opacity-0 pointer-events-none'
        }`}
      >
        {message}
      </div>
    </div>
  );
}
