import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AlertCard } from '../components/AlertCard.js';
import { EmptyState } from '../components/EmptyState.js';
import { useHistory } from '../hooks/useHistory.js';

export function History() {
  const navigate = useNavigate();
  const {
    alerts,
    isLoading,
    isFetching,
    hasMore,
    loadMore,
  } = useHistory();

  const handleCardClick = useCallback(
    (alertId: string) => {
      navigate(`/event/${alertId}`);
    },
    [navigate],
  );

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h1 className="text-lg font-semibold text-text-primary">History</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Every past event in reverse chronological order.
        </p>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-interactive-default" />
          <p className="mt-3 text-sm font-medium text-text-secondary animate-pulse">
            Loading event archive\u2026
          </p>
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState
          icon="📜"
          title="No historical events yet"
          description="Past events will appear here as the archive fills in."
        />
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="cursor-pointer rounded-2xl transition-all hover:ring-1 hover:ring-interactive-default/30"
              onClick={() => handleCardClick(alert.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCardClick(alert.id);
              }}
            >
              <AlertCard alert={alert} />
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={isFetching}
                className="inline-flex items-center gap-2 rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition hover:border-interactive-default disabled:opacity-50"
              >
                {isFetching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>Load more</>
                )}
              </button>
            </div>
          )}

          {/* Fetching indicator when paginating */}
          {isFetching && !isLoading && alerts.length > 0 && !hasMore && (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-text-tertiary" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
