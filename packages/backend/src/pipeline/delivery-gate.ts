import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ConfidenceLevel,
  LLMDirection,
  LLMEnrichment,
  RawEvent,
  Severity,
} from '@event-radar/shared';

// ── Types ────────────────────────────────────────────────────────────

export interface DeliveryGateInput {
  event: RawEvent;
  enrichment: LLMEnrichment | null;
  classificationConfidence: number;
  confidenceBucket: ConfidenceLevel;
  classifierDirection: LLMDirection;
  classifierSeverity: Severity;
}

export interface DeliveryGateResult {
  pass: boolean;
  tier: 'critical' | 'high' | 'feed' | 'archive';
  reason: string;
  gateDetails: {
    hasTicker: boolean;
    hasDirection: boolean;
    isNotable: boolean;
    isMacro: boolean;
    enrichmentAvailable: boolean;
    action: string | null;
    confidenceBucket: string;
  };
}

// ── Constants ────────────────────────────────────────────────────────

const MACRO_SOURCES = new Set(['econ-calendar', 'breaking-news']);

const MACRO_EVENT_TYPES = new Set([
  'economic_data',
  'fed_announcement',
  'executive_order',
  'congress_bill',
  'federal_register',
]);

// ── Helpers ──────────────────────────────────────────────────────────

function normalizeTicker(symbol: string): string {
  return symbol.replace(/[.\-]/g, '').toUpperCase();
}

function loadNotableTickersFromFile(): Set<string> {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const filePath = resolve(__dirname, '../config/notable-tickers.json');
  const raw = readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw) as { tickers: string[] };
  return new Set(data.tickers.map((t) => normalizeTicker(t)));
}

// ── DeliveryGate ─────────────────────────────────────────────────────

export class DeliveryGate {
  private readonly notableTickers: Set<string>;

  constructor(notableTickers?: Set<string>) {
    this.notableTickers = notableTickers ?? loadNotableTickersFromFile();
  }

  evaluate(input: DeliveryGateInput): DeliveryGateResult {
    const { event, enrichment, confidenceBucket, classifierDirection, classifierSeverity } = input;

    const enrichmentAvailable = enrichment !== null;
    const action = enrichment?.action ?? null;
    const isHighConfidence = confidenceBucket === 'high';

    // ── 1. Enrichment unavailable ──────────────────────────────────
    if (!enrichmentAvailable) {
      if (classifierSeverity === 'CRITICAL' && isHighConfidence) {
        return this.result(true, 'feed', 'enrichment_unavailable_critical_passthrough', {
          hasTicker: false, hasDirection: false, isNotable: false,
          isMacro: false, enrichmentAvailable: false, action: null, confidenceBucket,
        });
      }
      return this.result(false, 'archive', 'enrichment_unavailable', {
        hasTicker: false, hasDirection: false, isNotable: false,
        isMacro: false, enrichmentAvailable: false, action: null, confidenceBucket,
      });
    }

    // ── 2. Source-specific pre-checks ──────────────────────────────
    if (event.source === 'trading-halt') {
      const haltTicker = typeof event.metadata?.['ticker'] === 'string'
        ? normalizeTicker(event.metadata['ticker'])
        : null;
      if (!haltTicker || !this.notableTickers.has(haltTicker)) {
        return this.result(false, 'archive', 'halt_unknown_ticker', {
          hasTicker: !!haltTicker, hasDirection: false, isNotable: false,
          isMacro: false, enrichmentAvailable: true, action, confidenceBucket,
        });
      }
    }

    if (event.source === 'sec-edgar') {
      const secTickers = this.collectTickers(event, enrichment);
      const hasNotableSec = secTickers.some((t) => this.notableTickers.has(t));
      if (!hasNotableSec) {
        return this.result(false, 'archive', 'sec_filing_unknown_ticker', {
          hasTicker: secTickers.length > 0, hasDirection: false, isNotable: false,
          isMacro: false, enrichmentAvailable: true, action, confidenceBucket,
        });
      }
      // SEC Form 4 (insider trades): only deliver if 🔴 High-Quality Setup
      // Routine insider disclosures are low-value noise for swing traders
      const isForm4 = event.title?.includes('Form 4') || event.type?.includes('sec_form_4');
      if (isForm4 && action !== '🔴 High-Quality Setup') {
        return this.result(false, 'archive', 'sec_form4_routine', {
          hasTicker: secTickers.length > 0, hasDirection: false, isNotable: hasNotableSec,
          isMacro: false, enrichmentAvailable: true, action, confidenceBucket,
        });
      }
    }

    // ── 3. Ticker resolution ───────────────────────────────────────
    const tickers = this.collectTickers(event, enrichment);
    const hasTicker = tickers.length > 0;

    // ── 4. Macro event detection ───────────────────────────────────
    const isMacro = MACRO_SOURCES.has(event.source) ||
      (typeof event.type === 'string' && MACRO_EVENT_TYPES.has(event.type));

    if (!hasTicker) {
      if (!isMacro) {
        return this.result(false, 'archive', 'no_ticker_not_macro', {
          hasTicker: false, hasDirection: false, isNotable: false,
          isMacro: false, enrichmentAvailable: true, action, confidenceBucket,
        });
      }
      if (isHighConfidence) {
        return this.result(true, 'feed', 'macro_event_high_confidence', {
          hasTicker: false, hasDirection: false, isNotable: false,
          isMacro: true, enrichmentAvailable: true, action, confidenceBucket,
        });
      }
      return this.result(false, 'archive', 'macro_event_low_confidence', {
        hasTicker: false, hasDirection: false, isNotable: false,
        isMacro: true, enrichmentAvailable: true, action, confidenceBucket,
      });
    }

    // ── 5. Direction check ─────────────────────────────────────────
    const enrichmentHasDirection = enrichment.tickers.some(
      (t) => t.direction === 'bullish' || t.direction === 'bearish',
    );
    const classifierHasDirection =
      classifierDirection === 'bullish' || classifierDirection === 'bearish';
    const hasDirection = enrichmentHasDirection || classifierHasDirection;

    // ── 6. Notable ticker check ────────────────────────────────────
    const isNotable = tickers.some((t) => this.notableTickers.has(t));

    // ── 7. Action-based routing ────────────────────────────────────
    if (action === '🔴 High-Quality Setup') {
      if (hasDirection && isNotable && isHighConfidence) {
        return this.result(true, 'critical', 'high_quality_notable_high_confidence', {
          hasTicker, hasDirection, isNotable, isMacro, enrichmentAvailable: true, action, confidenceBucket,
        });
      }
      if (hasDirection && isHighConfidence) {
        return this.result(true, 'high', 'high_quality_high_confidence', {
          hasTicker, hasDirection, isNotable, isMacro, enrichmentAvailable: true, action, confidenceBucket,
        });
      }
      return this.result(true, 'feed', 'high_quality_fallback', {
        hasTicker, hasDirection, isNotable, isMacro, enrichmentAvailable: true, action, confidenceBucket,
      });
    }

    if (action === '🟡 Monitor') {
      if (hasDirection && isNotable && isHighConfidence) {
        return this.result(true, 'feed', 'monitor_notable_high_confidence', {
          hasTicker, hasDirection, isNotable, isMacro, enrichmentAvailable: true, action, confidenceBucket,
        });
      }
      return this.result(false, 'archive', 'monitor_low_priority', {
        hasTicker, hasDirection, isNotable, isMacro, enrichmentAvailable: true, action, confidenceBucket,
      });
    }

    // 🟢 Background → always archive
    return this.result(false, 'archive', 'background_event', {
      hasTicker, hasDirection, isNotable, isMacro, enrichmentAvailable: true, action, confidenceBucket,
    });
  }

  // ── Private ────────────────────────────────────────────────────────

  private collectTickers(event: RawEvent, enrichment: LLMEnrichment | null): string[] {
    const tickerSet = new Set<string>();

    if (enrichment?.tickers) {
      for (const t of enrichment.tickers) {
        tickerSet.add(normalizeTicker(t.symbol));
      }
    }

    const metaTicker = event.metadata?.['ticker'];
    if (typeof metaTicker === 'string' && metaTicker.length > 0) {
      tickerSet.add(normalizeTicker(metaTicker));
    }

    return [...tickerSet];
  }

  private result(
    pass: boolean,
    tier: DeliveryGateResult['tier'],
    reason: string,
    gateDetails: DeliveryGateResult['gateDetails'],
  ): DeliveryGateResult {
    return { pass, tier, reason, gateDetails };
  }
}
