import { useQuery } from '@tanstack/react-query';
import { getEventDetail, getEventOutcome, getEventScorecard } from '../lib/api.js';

export function useEventDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['event-detail', id],
    queryFn: async () => {
      if (!id) {
        return null;
      }

      const [detail, scorecard, outcome] = await Promise.all([
        getEventDetail(id),
        getEventScorecard(id),
        getEventOutcome(id).catch(() => null),
      ]);

      if (!detail) {
        return null;
      }

      return {
        ...detail,
        scorecard,
        outcome,
      };
    },
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}
