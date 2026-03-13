import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditTrail } from './AuditTrail.js';

const useAuditMock = vi.fn();
const useDashboardMock = vi.fn();

vi.mock('../hooks/queries.js', () => ({
  useAudit: (...args: unknown[]) => useAuditMock(...args),
  useDashboard: (...args: unknown[]) => useDashboardMock(...args),
}));

describe('AuditTrail llm enrichment details', () => {
  beforeEach(() => {
    useAuditMock.mockReset();
    useDashboardMock.mockReset();
    useDashboardMock.mockReturnValue({
      data: {
        scanners: {
          details: [],
        },
      },
    });
    useAuditMock.mockReturnValue({
      data: {
        count: 1,
        events: [
          {
            id: 1,
            event_id: 'evt-1',
            source: 'sec-edgar',
            title: 'Nvidia filing update',
            severity: 'HIGH',
            ticker: 'NVDA',
            outcome: 'delivered',
            stopped_at: 'delivery',
            reason: 'passed filters',
            reason_category: 'filter_pass',
            delivery_channels: [{ channel: 'discord', ok: true }],
            historical_match: true,
            historical_confidence: '0.78',
            duration_ms: 1420,
            at: '2026-03-13T12:00:00.000Z',
            llm_enrichment: {
              analysis: 'The filing confirms a customer ramp.\n\nStreet numbers may need to move higher.',
              action: '🔴 立即关注',
              tickers: ['NVDA', 'SMCI'],
              regimeContext: 'Risk-on tape should amplify momentum.',
              confidence: 0.82,
            },
          },
        ],
      },
      isLoading: false,
      error: null,
    });
  });

  it('renders llm enrichment analysis, action, tickers, and confidence when a row is expanded', async () => {
    const user = userEvent.setup();

    render(<AuditTrail />);

    await user.click(screen.getByText('Nvidia filing update'));

    expect(screen.getByText('LLM Enrichment')).toBeTruthy();
    expect(screen.getByText(/the filing confirms a customer ramp/i)).toBeTruthy();
    expect(screen.getByText('🔴 立即关注')).toBeTruthy();
    expect(screen.getAllByText('NVDA').length).toBeGreaterThan(0);
    expect(screen.getByText('SMCI')).toBeTruthy();
    expect(screen.getByText('82%')).toBeTruthy();
  });

  it('omits the llm enrichment panel when the event has no enrichment payload', async () => {
    const user = userEvent.setup();
    useAuditMock.mockReturnValue({
      data: {
        count: 1,
        events: [
          {
            id: 2,
            event_id: 'evt-2',
            source: 'reddit',
            title: 'No enrichment event',
            severity: 'LOW',
            ticker: null,
            outcome: 'filtered',
            stopped_at: 'llm_judge',
            reason: 'speculation only',
            reason_category: 'llm_judge',
            delivery_channels: null,
            historical_match: false,
            historical_confidence: null,
            duration_ms: 210,
            at: '2026-03-13T12:00:00.000Z',
            llm_enrichment: null,
          },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(<AuditTrail />);

    await user.click(screen.getByText('No enrichment event'));

    expect(screen.queryByText('LLM Enrichment')).toBeNull();
  });
});
