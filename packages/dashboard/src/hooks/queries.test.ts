import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useJudgeRecent, useJudgeStats } from './queries.js';

const useQueryMock = vi.fn();
const useInfiniteQueryMock = vi.fn();
const fetchJudgeRecentMock = vi.fn();
const fetchJudgeStatsMock = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => useQueryMock(options),
  useInfiniteQuery: (options: unknown) => useInfiniteQueryMock(options),
}));

vi.mock('../api/client.js', () => ({
  fetchDashboard: vi.fn(),
  fetchAudit: vi.fn(),
  fetchAuditStats: vi.fn(),
  fetchDeliveryFeed: vi.fn(),
  fetchJudgeRecent: (...args: unknown[]) => fetchJudgeRecentMock(...args),
  fetchJudgeStats: (...args: unknown[]) => fetchJudgeStatsMock(...args),
  fetchScannersStatus: vi.fn(),
  fetchScannerEvents: vi.fn(),
  fetchHealth: vi.fn(),
}));

describe('judge query hooks', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useInfiniteQueryMock.mockReset();
    fetchJudgeRecentMock.mockReset();
    fetchJudgeStatsMock.mockReset();
    useQueryMock.mockReturnValue({ data: undefined, isLoading: false, error: null });
  });

  it('configures a 15 second refetch interval for recent judge decisions', async () => {
    useJudgeRecent(25);

    expect(useQueryMock).toHaveBeenCalledWith(expect.objectContaining({
      queryKey: ['judge-recent', 25],
      refetchInterval: 15_000,
    }));

    const [{ queryFn }] = useQueryMock.mock.calls[0] as [{ queryFn: () => Promise<unknown> }];
    await queryFn();
    expect(fetchJudgeRecentMock).toHaveBeenCalledWith(25);
  });

  it('configures a 15 second refetch interval for judge stats', async () => {
    useJudgeStats({ since: '24h' });

    expect(useQueryMock).toHaveBeenCalledWith(expect.objectContaining({
      queryKey: ['judge-stats', { since: '24h' }],
      refetchInterval: 15_000,
    }));

    const [{ queryFn }] = useQueryMock.mock.calls[0] as [{ queryFn: () => Promise<unknown> }];
    await queryFn();
    expect(fetchJudgeStatsMock).toHaveBeenCalledWith({ since: '24h' });
  });
});
