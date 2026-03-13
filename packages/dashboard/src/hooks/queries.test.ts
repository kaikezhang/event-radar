import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useDeliveryFeed, useScannerEvents } from './queries.js';

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn((options) => options),
  useInfiniteQuery: vi.fn((options) => options),
}));

vi.mock('../api/client.js', () => ({
  fetchDashboard: vi.fn(),
  fetchAudit: vi.fn(),
  fetchAuditStats: vi.fn(),
  fetchDeliveryFeed: vi.fn(),
  fetchScannersStatus: vi.fn(),
  fetchScannerEvents: vi.fn(),
  fetchHealth: vi.fn(),
}));

describe('query polling intervals', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockClear();
    vi.mocked(useInfiniteQuery).mockClear();
  });

  it('refreshes scanner events every 15 seconds', () => {
    useScannerEvents('sec-edgar');

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['scanner-events', 'sec-edgar'],
        refetchInterval: 15_000,
      }),
    );
  });

  it('refreshes the delivery feed every 15 seconds', () => {
    useDeliveryFeed();

    expect(useInfiniteQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['delivery-feed', 20],
        refetchInterval: 15_000,
      }),
    );
  });
});
