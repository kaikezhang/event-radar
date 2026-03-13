import { useQuery } from '@tanstack/react-query';
import { getEventDetail } from '../lib/api.js';

export function useEventDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['event-detail', id],
    queryFn: () => (id ? getEventDetail(id) : Promise.resolve(null)),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}
