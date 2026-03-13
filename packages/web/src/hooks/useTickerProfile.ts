import { useQuery } from '@tanstack/react-query';
import { getTickerProfile } from '../lib/api.js';

export function useTickerProfile(symbol: string | undefined) {
  return useQuery({
    queryKey: ['ticker-profile', symbol],
    queryFn: () => (symbol ? getTickerProfile(symbol) : Promise.resolve(null)),
    enabled: Boolean(symbol),
    staleTime: 30_000,
  });
}
