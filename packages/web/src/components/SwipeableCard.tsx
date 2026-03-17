import { useRef, useCallback, useState, type ReactNode } from 'react';
import { X, Star } from 'lucide-react';

interface SwipeableCardProps {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftLabel?: string;
  rightLabel?: string;
  disabled?: boolean;
}

const THRESHOLD_RATIO = 0.4;
const VERTICAL_LOCK = 10;

export function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftLabel = 'Dismiss',
  rightLabel = '\u2605 Watchlist',
  disabled = false,
}: SwipeableCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const swiping = useRef(false);
  const locked = useRef(false);
  const [offset, setOffset] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      const touch = e.touches[0];
      startX.current = touch.clientX;
      startY.current = touch.clientY;
      currentX.current = 0;
      swiping.current = false;
      locked.current = false;
      setTransitioning(false);
    },
    [disabled],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || locked.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX.current;
      const dy = touch.clientY - startY.current;

      // If vertical movement dominates, lock out horizontal swiping
      if (!swiping.current && Math.abs(dy) > VERTICAL_LOCK && Math.abs(dy) > Math.abs(dx)) {
        locked.current = true;
        return;
      }

      if (!swiping.current && Math.abs(dx) > VERTICAL_LOCK) {
        swiping.current = true;
      }

      if (swiping.current) {
        currentX.current = dx;
        setOffset(dx);
      }
    },
    [disabled],
  );

  const handleTouchEnd = useCallback(() => {
    if (disabled || !swiping.current) {
      setOffset(0);
      return;
    }

    const el = containerRef.current;
    if (!el) {
      setOffset(0);
      return;
    }

    const width = el.offsetWidth;
    const threshold = width * THRESHOLD_RATIO;
    const dx = currentX.current;

    if (dx < -threshold && onSwipeLeft) {
      // Haptic feedback
      if ('vibrate' in navigator) {
        navigator.vibrate(10);
      }
      setTransitioning(true);
      setOffset(-width);
      setTimeout(() => {
        setDismissed(true);
        onSwipeLeft();
      }, 250);
    } else if (dx > threshold && onSwipeRight) {
      if ('vibrate' in navigator) {
        navigator.vibrate(10);
      }
      setTransitioning(true);
      setOffset(0);
      onSwipeRight();
    } else {
      // Spring back
      setTransitioning(true);
      setOffset(0);
      setTimeout(() => setTransitioning(false), 250);
    }

    swiping.current = false;
  }, [disabled, onSwipeLeft, onSwipeRight]);

  if (dismissed) return null;

  const pastLeftThreshold =
    containerRef.current && Math.abs(offset) > containerRef.current.offsetWidth * THRESHOLD_RATIO && offset < 0;
  const pastRightThreshold =
    containerRef.current && offset > containerRef.current.offsetWidth * THRESHOLD_RATIO;

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-2xl">
      {/* Swipe left background (dismiss) */}
      {offset < 0 && (
        <div
          className="absolute inset-0 flex items-center justify-end rounded-2xl px-6"
          style={{ backgroundColor: pastLeftThreshold ? '#ea580c' : '#9a3412' }}
        >
          <div className="flex items-center gap-2 text-white font-semibold text-sm">
            <span>{leftLabel}</span>
            <X className="h-5 w-5" />
          </div>
        </div>
      )}

      {/* Swipe right background (watchlist) */}
      {offset > 0 && (
        <div
          className="absolute inset-0 flex items-center justify-start rounded-2xl px-6"
          style={{ backgroundColor: pastRightThreshold ? '#16a34a' : '#166534' }}
        >
          <div className="flex items-center gap-2 text-white font-semibold text-sm">
            <Star className="h-5 w-5" />
            <span>{rightLabel}</span>
          </div>
        </div>
      )}

      {/* Card content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${offset}px)`,
          transition: transitioning ? 'transform 250ms ease-out' : 'none',
          willChange: swiping.current ? 'transform' : 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}
