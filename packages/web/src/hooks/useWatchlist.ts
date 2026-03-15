import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWatchlist, addToWatchlist, removeFromWatchlist, getWatchlistSummary } from '../lib/api.js';
import type { WatchlistItem } from '../types/index.js';
import type { WatchlistTickerSummary } from '../lib/api.js';

export function useWatchlist() {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery<WatchlistItem[]>({
    queryKey: ['watchlist'],
    queryFn: getWatchlist,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: (ticker: string) => addToWatchlist(ticker),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (ticker: string) => removeFromWatchlist(ticker),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchlist'] });
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
