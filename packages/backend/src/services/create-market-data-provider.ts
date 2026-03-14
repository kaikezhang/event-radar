import { MarketDataError, type MarketDataProvider } from './market-data-provider.js';
import { AlphaVantageMarketDataProvider } from './providers/alpha-vantage-provider.js';

export interface CreateMarketDataProviderOptions {
  provider?: 'alpha-vantage';
  apiKey?: string;
  fetchFn?: typeof fetch;
  maxRetries?: number;
  backoffMs?: number;
}

export function createMarketDataProvider(
  options?: CreateMarketDataProviderOptions,
): MarketDataProvider {
  const provider = options?.provider ?? 'alpha-vantage';

  switch (provider) {
    case 'alpha-vantage':
      return new AlphaVantageMarketDataProvider({
        apiKey: options?.apiKey ?? process.env.ALPHA_VANTAGE_API_KEY ?? '',
        fetchFn: options?.fetchFn,
        maxRetries: options?.maxRetries,
        backoffMs: options?.backoffMs,
      });
    default:
      throw new MarketDataError(`Unsupported market data provider: ${provider}`, 'api_error');
  }
}
