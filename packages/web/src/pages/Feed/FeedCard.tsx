import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { AlertCard } from '../../components/AlertCard.js';
import { SwipeableCard } from '../../components/SwipeableCard.js';
import { cn } from '../../lib/utils.js';
import type { AlertSummary, PriceBatchQuote, ScorecardSummary } from '../../types/index.js';
import { getTrustCue } from './useFeedState.js';

interface FeedCardProps {
  alert: AlertSummary;
  isDesktop: boolean;
  isNew: boolean;
  isOnWatchlist: boolean;
  isSelected: boolean;
  onCardClick: (event: ReactMouseEvent, alertId: string) => void;
  onDismiss: (alertId: string) => void;
  onQuickWatchlist: (alert: AlertSummary) => void | Promise<void>;
  onToggleWatchlist: (ticker: string) => void;
  priceQuote?: PriceBatchQuote;
  scorecardSummary: ScorecardSummary | null;
}

export function FeedCard({
  alert,
  isDesktop,
  isNew,
  isOnWatchlist,
  isSelected,
  onCardClick,
  onDismiss,
  onQuickWatchlist,
  onToggleWatchlist,
  priceQuote,
  scorecardSummary,
}: FeedCardProps) {
  const relatedEventCount = (alert.dedupCount ?? 0) + 1;
  const relatedTicker = alert.tickers[0]?.toUpperCase() ?? 'Event';

  const card = (
    <div
      className={cn(
        'rounded-2xl transition-all',
        isNew && 'animate-highlight',
        isDesktop && isSelected && 'ring-2 ring-accent-default/50 bg-bg-elevated/50',
        !isDesktop && 'active:scale-[0.98]',
      )}
      data-alert-id={alert.id}
      onClick={(event) => onCardClick(event, alert.id)}
      role={isDesktop ? 'button' : undefined}
      tabIndex={isDesktop ? 0 : undefined}
      onKeyDown={isDesktop ? (event) => handleKeyDown(event, alert.id, onCardClick) : undefined}
    >
      <AlertCard
        alert={alert}
        trustCue={getTrustCue(alert.sourceKey, scorecardSummary)}
        showWatchlistButton
        isOnWatchlist={isOnWatchlist}
        onToggleWatchlist={onToggleWatchlist}
        priceQuote={priceQuote}
      />
      {alert.dedupCount != null && alert.dedupCount > 0 && (
        <div className="mt-1 space-y-0.5 px-3 pb-1">
          <p className="text-xs font-medium text-text-secondary">
            {relatedTicker} · {relatedEventCount} related events
          </p>
          {alert.relatedSources && alert.relatedSources.length > 0 ? (
            <p className="text-xs text-text-tertiary">
              Also reported by: {alert.relatedSources.join(', ')}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );

  if (isDesktop) {
    return card;
  }

  return (
    <SwipeableCard
      onSwipeLeft={() => onDismiss(alert.id)}
      onSwipeRight={() => onQuickWatchlist(alert)}
    >
      {card}
    </SwipeableCard>
  );
}

function handleKeyDown(
  event: ReactKeyboardEvent<HTMLDivElement>,
  alertId: string,
  onCardClick: (event: ReactMouseEvent, alertId: string) => void,
) {
  if (event.key === 'Enter') {
    onCardClick(event as unknown as ReactMouseEvent, alertId);
  }
}
