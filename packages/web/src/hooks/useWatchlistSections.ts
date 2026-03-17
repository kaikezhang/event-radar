import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getWatchlistSections,
  createWatchlistSection,
  updateWatchlistSection,
  deleteWatchlistSection,
  reorderWatchlist,
} from '../lib/api.js';
import type { WatchlistSection } from '../types/index.js';

export function useWatchlistSections() {
  const queryClient = useQueryClient();

  const { data: sections = [], isLoading } = useQuery<WatchlistSection[]>({
    queryKey: ['watchlist-sections'],
    queryFn: getWatchlistSections,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: ({ name, color }: { name: string; color?: string }) =>
      createWatchlistSection(name, color),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchlist-sections'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{ name: string; color: string; sortOrder: number }>;
    }) => updateWatchlistSection(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchlist-sections'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWatchlistSection(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchlist-sections'] });
      void queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (items: Array<{ ticker: string; sortOrder: number; sectionId?: string | null }>) =>
      reorderWatchlist(items),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });

  return {
    sections,
    isLoading,
    create: createMutation.mutate,
    update: updateMutation.mutate,
    remove: deleteMutation.mutate,
    reorder: reorderMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isReordering: reorderMutation.isPending,
  };
}
