import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWatchlist, addToWatchlist, removeFromWatchlist, getWatchlistSummary, updateWatchlistItem, bulkAddWatchlist } from '../lib/api.js';
import type { WatchlistItem } from '../types/index.js';
import type { WatchlistTickerSummary } from '../lib/api.js';

export function useWatchlist(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery<WatchlistItem[]>({
    queryKey: ['watchlist'],
    queryFn: getWatchlist,
    staleTime: 30_000,
    enabled,
  });

  const addMutation = useMutation({
    mutationFn: (ticker: string) => addToWatchlist(ticker),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      void queryClient.invalidateQueries({ queryKey: ['watchlist-feed-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (ticker: string) => removeFromWatchlist(ticker),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      void queryClient.invalidateQueries({ queryKey: ['watchlist-feed-stats'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ ticker, data }: { ticker: string; data: { notes?: string; sectionId?: string | null } }) =>
      updateWatchlistItem(ticker, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      void queryClient.invalidateQueries({ queryKey: ['watchlist-feed-stats'] });
    },
  });

  const bulkAddMutation = useMutation({
    mutationFn: (tickers: Array<{ ticker: string; sectionId?: string; notes?: string }>) =>
      bulkAddWatchlist(tickers),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      void queryClient.invalidateQueries({ queryKey: ['watchlist-feed-stats'] });
    },
  });

  const isOnWatchlist = (ticker: string) =>
    items.some((w) => w.ticker === ticker.toUpperCase());

  return {
    items,
    isLoading,
    add: addMutation.mutate,
    addAsync: addMutation.mutateAsync,
    remove: removeMutation.mutate,
    updateItem: updateItemMutation.mutate,
    bulkAdd: bulkAddMutation.mutate,
    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
    isOnWatchlist,
  };
}

export function useWatchlistSummary() {
  const { data: summary = [], isLoading } = useQuery<WatchlistTickerSummary[]>({
    queryKey: ['watchlist-summary'],
    queryFn: getWatchlistSummary,
    staleTime: 30_000,
  });

  return { summary, isLoading };
}
