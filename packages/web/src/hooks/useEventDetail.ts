import { useQuery } from '@tanstack/react-query';
import { getEventDetail, getEventScorecard } from '../lib/api.js';

export function useEventDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['event-detail', id],
    queryFn: async () => {
      if (!id) {
        return null;
      }

      const [detail, scorecard] = await Promise.all([
        getEventDetail(id),
        getEventScorecard(id),
      ]);

      if (!detail) {
        return null;
      }

      return {
        ...detail,
        scorecard,
      };
    },
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}
