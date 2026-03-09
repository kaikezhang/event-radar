# Vision

## The Problem

Information moves through a predictable chain before reaching most traders:

```
SEC Filing / Official Source  (T+0s)
    ↓
Financial Media (Reuters, CNBC)  (T+30min to T+2hr)
    ↓
Social Media Influencers  (T+1hr to T+4hr)
    ↓
Retail Traders  (T+2hr to T+next day)
```

By the time most people hear about a restructuring, an insider buy, or a presidential tariff threat, the move has already happened. Institutional traders have algorithms parsing SEC filings in milliseconds. Retail traders are reading about it on Twitter the next morning.

**The 2-hour gap between SEC filing and mainstream news coverage is where 80% of the move happens.**

### Real Example: Block (XYZ) — Feb 26, 2026

- **4:05 PM** — 8-K filed with SEC: layoffs + AI restructuring
- **5-6 PM** — CNBC picks it up
- **Evening** — Social media bloggers post about it
- **Result** — Stock moved from $54 to $67 (+23.5%) in hours

Anyone monitoring SEC EDGAR in real-time could have acted at 4:06 PM.

## The Solution

Event Radar collapses the information chain. Instead of waiting for media to curate and publish, it goes directly to primary sources — all of them — and uses AI to classify what matters.

```
30+ Primary Sources  (T+0s)
    ↓
AI Classification + Scoring  (T+5s)
    ↓
Multi-Signal Correlation  (T+10s)
    ↓
Your Screen / Phone  (T+15-30s)
```

## Who Is This For?

- **Event-driven swing traders** — The core audience. People who trade catalysts (earnings, restructuring, M&A, policy changes) on a multi-day to multi-week horizon.
- **Active investors** — Anyone who wants to know about material events affecting their portfolio in real-time, not next-day.
- **Quant researchers** — Historical event data + outcome tracking enables backtesting event-driven strategies.

## What This Is NOT

- ❌ Not a trading bot — No automated execution
- ❌ Not a Bloomberg replacement — No chat, no fixed income, no full terminal
- ❌ Not a news aggregator — We don't republish articles; we detect events from primary sources
- ❌ Not financial advice — Tool for information, not recommendations

## Success Metrics

| Metric | Target |
|--------|--------|
| Source-to-alert latency | < 60 seconds for Tier 1 sources |
| Event classification accuracy | > 85% correct type + direction |
| False positive rate | < 15% of HIGH+ alerts |
| Source coverage | 30+ sources across all 6 tiers |
| Uptime | 99.5%+ during market hours |
| Historical backtest coverage | 2 years of events with outcome data |

## Competitive Landscape

| Product | Price | Real-time Alerts | AI Classification | Multi-Source | Open Source |
|---------|-------|-----------------|-------------------|-------------|-------------|
| Bloomberg Terminal | $24K/yr | ✅ | ❌ | ✅ | ❌ |
| LevelFields | $99/mo | ✅ | ✅ | Partial | ❌ |
| SentryDock | $29/mo | ✅ | Partial | Partial | ❌ |
| Benzinga Pro | $177/mo | ✅ | ❌ | ✅ | ❌ |
| Minas Watch | Free/Pro | ✅ | ❌ | SEC+PR only | ❌ |
| **Event Radar** | **Free** | **✅** | **✅** | **✅ 30+** | **✅** |

Our differentiation: **widest source coverage + AI classification + fully open source + self-hosted.**

## Long-Term Vision

Phase 1: Best-in-class event detection and alerting platform.

Phase 2: Community-contributed scanners (anyone can add a new data source as a plugin).

Phase 3: Backtesting marketplace — share and validate event-driven strategies with historical data.

---

*See [Roadmap](ROADMAP.md) for the phased plan to get there.*
