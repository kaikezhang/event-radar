import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/utils.js';

interface TapTooltipProps {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  tooltip: string;
}

export function TapTooltip({
  ariaLabel,
  children,
  className,
  panelClassName,
  tooltip,
}: TapTooltipProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open]);

  return (
    <span ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        aria-label={ariaLabel}
        className={className}
        onClick={() => setOpen((current) => !current)}
        title={tooltip}
      >
        {children}
      </button>
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className={cn(
            'absolute left-1/2 top-full z-40 mt-2 w-56 -translate-x-1/2 rounded-xl border border-border-default bg-bg-elevated px-3 py-2 text-xs leading-5 text-text-secondary shadow-[0_12px_28px_rgba(0,0,0,0.28)]',
            panelClassName,
          )}
        >
          {tooltip}
        </span>
      ) : null}
    </span>
  );
}
