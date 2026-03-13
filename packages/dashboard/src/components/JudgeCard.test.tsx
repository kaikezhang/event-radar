import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JudgeCard } from './JudgeCard.js';

const useJudgeRecentMock = vi.fn();
const useJudgeStatsMock = vi.fn();

vi.mock('../hooks/queries.js', () => ({
  useJudgeRecent: (...args: unknown[]) => useJudgeRecentMock(...args),
  useJudgeStats: (...args: unknown[]) => useJudgeStatsMock(...args),
}));

vi.mock('recharts', () => {
  const MockChart = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const MockCell = () => <div />;

  return {
    PieChart: MockChart,
    Pie: MockChart,
    Cell: MockCell,
    Tooltip: () => <div />,
    ResponsiveContainer: MockChart,
    BarChart: MockChart,
    Bar: MockChart,
    CartesianGrid: () => <div />,
    XAxis: () => <div />,
    YAxis: () => <div />,
  };
});

describe('JudgeCard', () => {
  beforeEach(() => {
    useJudgeRecentMock.mockReset();
    useJudgeStatsMock.mockReset();
    useJudgeRecentMock.mockReturnValue({
      data: { events: [] },
      isLoading: false,
      error: null,
    });
    useJudgeStatsMock.mockReturnValue({
      data: { bySource: {}, total: { passed: 0, blocked: 0 } },
      isLoading: false,
      error: null,
    });
  });

  it('renders judge totals, source stats, and recent decision badges', () => {
    useJudgeStatsMock.mockReturnValue({
      data: {
        bySource: {
          'breaking-news': { passed: 4, blocked: 1 },
          reddit: { passed: 1, blocked: 3 },
        },
        total: { passed: 5, blocked: 4 },
      },
      isLoading: false,
      error: null,
    });
    useJudgeRecentMock.mockReturnValue({
      data: {
        events: [
          {
            id: 'evt-1',
            title: 'Apple supplier shift',
            source: 'breaking-news',
            severity: 'HIGH',
            decision: 'PASS',
            confidence: 0.84,
            reason: 'material update',
            ticker: 'AAPL',
            at: '2026-03-13T12:00:00.000Z',
          },
          {
            id: 'evt-2',
            title: 'Rumor thread',
            source: 'reddit',
            severity: 'LOW',
            decision: 'BLOCK',
            confidence: 0.21,
            reason: 'speculation only',
            ticker: 'TSLA',
            at: '2026-03-13T11:00:00.000Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<JudgeCard />);

    expect(screen.getByText('LLM Judge')).toBeTruthy();
    expect(screen.getByText('4/5 passed')).toBeTruthy();
    expect(screen.getAllByText('breaking-news').length).toBeGreaterThan(0);
    expect(screen.getByText('Apple supplier shift')).toBeTruthy();
    expect(screen.getAllByText('PASS').length).toBeGreaterThan(0);
    expect(screen.getAllByText('BLOCK').length).toBeGreaterThan(0);
  });

  it('renders an empty state when no recent judge events exist', () => {
    render(<JudgeCard />);

    expect(screen.getAllByText('No recent judge decisions')).toHaveLength(2);
    expect(screen.getByText('No source-level judge stats yet')).toBeTruthy();
  });

  it('renders an error state when judge queries fail before any data is available', () => {
    useJudgeRecentMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('judge recent failed'),
    });
    useJudgeStatsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });

    render(<JudgeCard />);

    expect(screen.getByText('judge recent failed')).toBeTruthy();
  });

  it('shows confidence percentages and reason snippets for recent decisions', () => {
    useJudgeRecentMock.mockReturnValue({
      data: {
        events: [
          {
            id: 'evt-1',
            title: 'Nvidia filing',
            source: 'sec-edgar',
            severity: 'CRITICAL',
            decision: 'PASS',
            confidence: 0.93,
            reason: 'clear catalyst with broad read-through',
            ticker: 'NVDA',
            at: '2026-03-13T12:00:00.000Z',
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<JudgeCard />);

    expect(screen.getByText('93%')).toBeTruthy();
    expect(screen.getByText(/clear catalyst with broad read-through/i)).toBeTruthy();
    expect(screen.getByText('NVDA')).toBeTruthy();
  });
});
