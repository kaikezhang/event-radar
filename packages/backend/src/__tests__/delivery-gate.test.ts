import { describe, it, expect, beforeEach } from 'vitest';
import type { LLMEnrichment, RawEvent } from '@event-radar/shared';
import { DeliveryGate, type DeliveryGateInput } from '../pipeline/delivery-gate.js';

/* ── helpers ─────────────────────────────────────────────────────── */

const NOTABLE = new Set(['AAPL', 'TSLA', 'MSFT', 'BRKB', 'NVDA']);

let eventCounter = 0;
function makeEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  eventCounter++;
  return {
    id: `550e8400-e29b-41d4-a716-44665544${String(eventCounter).padStart(4, '0')}`,
    source: 'sec-edgar',
    type: '8-K',
    title: 'Test Corp files for bankruptcy',
    body: 'Test Corp has filed for Chapter 11 bankruptcy protection.',
    url: 'https://www.sec.gov/filing/test',
    timestamp: new Date('2024-01-15T10:00:00Z'),
    metadata: { ticker: 'AAPL' },
    ...overrides,
  };
}

function makeEnrichment(overrides: Partial<LLMEnrichment> = {}): LLMEnrichment {
  return {
    summary: 'Test summary',
    impact: 'Test impact',
    action: '🔴 High-Quality Setup',
    tickers: [{ symbol: 'AAPL', direction: 'bullish' }],
    ...overrides,
  };
}

function makeInput(overrides: Partial<DeliveryGateInput> = {}): DeliveryGateInput {
  return {
    event: makeEvent(),
    enrichment: makeEnrichment(),
    classificationConfidence: 0.85,
    confidenceBucket: 'high',
    classifierDirection: 'bullish',
    classifierSeverity: 'HIGH',
    ...overrides,
  };
}

beforeEach(() => {
  eventCounter = 0;
});

/* ── tests ────────────────────────────────────────────────────────── */

describe('DeliveryGate', () => {
  let gate: DeliveryGate;

  beforeEach(() => {
    gate = new DeliveryGate(NOTABLE);
  });

  // ── 1. Enrichment unavailable ──────────────────────────────────

  it('no enrichment + CRITICAL + high → pass as feed', () => {
    const result = gate.evaluate(makeInput({
      enrichment: null,
      classifierSeverity: 'CRITICAL',
      confidenceBucket: 'high',
    }));
    expect(result.pass).toBe(true);
    expect(result.tier).toBe('feed');
    expect(result.reason).toBe('enrichment_unavailable_critical_passthrough');
    expect(result.gateDetails.enrichmentAvailable).toBe(false);
  });

  it('no enrichment + LOW + low → archive', () => {
    const result = gate.evaluate(makeInput({
      enrichment: null,
      classifierSeverity: 'LOW',
      confidenceBucket: 'low',
    }));
    expect(result.pass).toBe(false);
    expect(result.tier).toBe('archive');
    expect(result.reason).toBe('enrichment_unavailable');
  });

  // ── 2. Source-specific pre-checks ──────────────────────────────

  it('trading halt + non-notable ticker → archive', () => {
    const result = gate.evaluate(makeInput({
      event: makeEvent({ source: 'trading-halt', metadata: { ticker: 'XYZQ' } }),
      enrichment: makeEnrichment({ tickers: [{ symbol: 'XYZQ', direction: 'bearish' }] }),
    }));
    expect(result.pass).toBe(false);
    expect(result.tier).toBe('archive');
    expect(result.reason).toBe('halt_unknown_ticker');
  });

  it('trading halt + notable ticker + 🔴 + high → critical', () => {
    const result = gate.evaluate(makeInput({
      event: makeEvent({ source: 'trading-halt', metadata: { ticker: 'AAPL' } }),
      enrichment: makeEnrichment({
        action: '🔴 High-Quality Setup',
        tickers: [{ symbol: 'AAPL', direction: 'bearish' }],
      }),
      confidenceBucket: 'high',
      classifierDirection: 'bearish',
    }));
    expect(result.pass).toBe(true);
    expect(result.tier).toBe('critical');
  });

  it('SEC 8-K + non-notable → archive', () => {
    const result = gate.evaluate(makeInput({
      event: makeEvent({ source: 'sec-edgar', metadata: { ticker: 'XYZQ' } }),
      enrichment: makeEnrichment({ tickers: [{ symbol: 'XYZQ', direction: 'bullish' }] }),
    }));
    expect(result.pass).toBe(false);
    expect(result.tier).toBe('archive');
    expect(result.reason).toBe('sec_filing_unknown_ticker');
  });

  it('SEC 8-K + notable + 🔴 → pass', () => {
    const result = gate.evaluate(makeInput({
      event: makeEvent({ source: 'sec-edgar', metadata: { ticker: 'TSLA' } }),
      enrichment: makeEnrichment({
        action: '🔴 High-Quality Setup',
        tickers: [{ symbol: 'TSLA', direction: 'bullish' }],
      }),
    }));
    expect(result.pass).toBe(true);
  });

  // ── 3. No ticker + macro detection ────────────────────────────

  it('no ticker + not macro → archive', () => {
    const result = gate.evaluate(makeInput({
      event: makeEvent({ source: 'newswire', type: 'social', metadata: {} }),
      enrichment: makeEnrichment({ tickers: [] }),
    }));
    expect(result.pass).toBe(false);
    expect(result.tier).toBe('archive');
    expect(result.reason).toBe('no_ticker_not_macro');
  });

  it('no ticker + macro + high confidence → feed', () => {
    const result = gate.evaluate(makeInput({
      event: makeEvent({ source: 'econ-calendar', type: 'economic_data', metadata: {} }),
      enrichment: makeEnrichment({ tickers: [] }),
      confidenceBucket: 'high',
    }));
    expect(result.pass).toBe(true);
    expect(result.tier).toBe('feed');
    expect(result.reason).toBe('macro_event_high_confidence');
  });

  it('no ticker + macro + low confidence → archive', () => {
    const result = gate.evaluate(makeInput({
      event: makeEvent({ source: 'econ-calendar', type: 'economic_data', metadata: {} }),
      enrichment: makeEnrichment({ tickers: [] }),
      confidenceBucket: 'low',
    }));
    expect(result.pass).toBe(false);
    expect(result.tier).toBe('archive');
    expect(result.reason).toBe('macro_event_low_confidence');
  });

  // ── 4. Action-based routing: 🔴 High-Quality Setup ─────────────

  it('🔴 + direction + notable + high → critical', () => {
    const result = gate.evaluate(makeInput({
      event: makeEvent({ metadata: { ticker: 'NVDA' } }),
      enrichment: makeEnrichment({
        action: '🔴 High-Quality Setup',
        tickers: [{ symbol: 'NVDA', direction: 'bullish' }],
      }),
      confidenceBucket: 'high',
      classifierDirection: 'bullish',
    }));
    expect(result.pass).toBe(true);
    expect(result.tier).toBe('critical');
  });

  it('🔴 + direction + high (not notable) → high', () => {
    const result = gate.evaluate(makeInput({
      event: makeEvent({ source: 'newswire', metadata: { ticker: 'XYZQ' } }),
      enrichment: makeEnrichment({
        action: '🔴 High-Quality Setup',
        tickers: [{ symbol: 'XYZQ', direction: 'bearish' }],
      }),
      confidenceBucket: 'high',
      classifierDirection: 'bearish',
    }));
    expect(result.pass).toBe(true);
    expect(result.tier).toBe('high');
  });

  it('🔴 + low confidence → feed', () => {
    const result = gate.evaluate(makeInput({
      event: makeEvent({ source: 'newswire', metadata: { ticker: 'AAPL' } }),
      enrichment: makeEnrichment({
        action: '🔴 High-Quality Setup',
        tickers: [{ symbol: 'AAPL', direction: 'neutral' }],
      }),
      confidenceBucket: 'low',
      classifierDirection: 'neutral',
    }));
    expect(result.pass).toBe(true);
    expect(result.tier).toBe('feed');
    expect(result.reason).toBe('high_quality_fallback');
  });

  // ── 5. Action-based routing: 🟡 Monitor ────────────────────────

  it('🟡 + direction + notable + high → feed', () => {
    const result = gate.evaluate(makeInput({
      event: makeEvent({ source: 'newswire', metadata: { ticker: 'MSFT' } }),
      enrichment: makeEnrichment({
        action: '🟡 Monitor',
        tickers: [{ symbol: 'MSFT', direction: 'bullish' }],
      }),
      confidenceBucket: 'high',
    }));
    expect(result.pass).toBe(true);
    expect(result.tier).toBe('feed');
    expect(result.reason).toBe('monitor_notable_high_confidence');
  });

  it('🟡 + anything else → archive', () => {
    const result = gate.evaluate(makeInput({
      event: makeEvent({ source: 'newswire', metadata: { ticker: 'XYZQ' } }),
      enrichment: makeEnrichment({
        action: '🟡 Monitor',
        tickers: [{ symbol: 'XYZQ', direction: 'neutral' }],
      }),
      confidenceBucket: 'medium',
      classifierDirection: 'neutral',
    }));
    expect(result.pass).toBe(false);
    expect(result.tier).toBe('archive');
    expect(result.reason).toBe('monitor_low_priority');
  });

  // ── 6. Action-based routing: 🟢 Background ─────────────────────

  it('🟢 → always archive', () => {
    const result = gate.evaluate(makeInput({
      event: makeEvent({ metadata: { ticker: 'AAPL' } }),
      enrichment: makeEnrichment({
        action: '🟢 Background',
        tickers: [{ symbol: 'AAPL', direction: 'bullish' }],
      }),
      confidenceBucket: 'high',
    }));
    expect(result.pass).toBe(false);
    expect(result.tier).toBe('archive');
    expect(result.reason).toBe('background_event');
  });

  // ── 7. Ticker normalization ─────────────────────────────────────

  it('normalizes BRK.B → BRKB for notable check', () => {
    const result = gate.evaluate(makeInput({
      event: makeEvent({ source: 'newswire', metadata: { ticker: 'BRK.B' } }),
      enrichment: makeEnrichment({
        action: '🔴 High-Quality Setup',
        tickers: [{ symbol: 'BRK.B', direction: 'bullish' }],
      }),
      confidenceBucket: 'high',
    }));
    expect(result.pass).toBe(true);
    expect(result.tier).toBe('critical');
    expect(result.gateDetails.isNotable).toBe(true);
  });

  // ── 8. Classifier direction fallback ────────────────────────────

  it('uses classifier direction when enrichment tickers are all neutral', () => {
    const result = gate.evaluate(makeInput({
      event: makeEvent({ source: 'newswire', metadata: { ticker: 'TSLA' } }),
      enrichment: makeEnrichment({
        action: '🔴 High-Quality Setup',
        tickers: [{ symbol: 'TSLA', direction: 'neutral' }],
      }),
      confidenceBucket: 'high',
      classifierDirection: 'bearish',
    }));
    expect(result.pass).toBe(true);
    expect(result.tier).toBe('critical');
    expect(result.gateDetails.hasDirection).toBe(true);
  });

  // ── 9. Gate details ─────────────────────────────────────────────

  it('populates gateDetails correctly', () => {
    const result = gate.evaluate(makeInput({
      event: makeEvent({ metadata: { ticker: 'AAPL' } }),
      enrichment: makeEnrichment({
        action: '🔴 High-Quality Setup',
        tickers: [{ symbol: 'AAPL', direction: 'bullish' }],
      }),
      confidenceBucket: 'high',
    }));
    expect(result.gateDetails).toEqual({
      hasTicker: true,
      hasDirection: true,
      isNotable: true,
      isMacro: false,
      enrichmentAvailable: true,
      action: '🔴 High-Quality Setup',
      confidenceBucket: 'high',
    });
  });
});
