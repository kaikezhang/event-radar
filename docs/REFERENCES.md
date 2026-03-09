# References & Open-Source Dependencies

We stand on the shoulders of giants. This document catalogs the open-source projects we reference, integrate, or draw inspiration from.

## Core Dependencies (Integrate Directly)

### EdgarTools
- **Repo**: [github.com/dgunning/edgartools](https://github.com/dgunning/edgartools)
- **Stars**: 1,800+ | **Language**: Python
- **What it does**: Turns SEC EDGAR filings into structured Python objects. Parses 8-K, Form 4, 13F, 10-K/Q, and 20+ other form types. AI-native with MCP server support.
- **How we use it**: **Core dependency for the SEC scanner.** We don't reinvent SEC filing parsing — edgartools handles 8-K item extraction, insider trade parsing, and institutional holdings. Our job is to wrap it in a real-time polling loop and feed results into the classification pipeline.
- **Key features we leverage**:
  - `get_filings(form="8-K")` → structured 8-K items
  - `Form 4` parsing → insider buy/sell with amounts
  - `13F` parsing → institutional portfolio changes
  - MCP server → potential AI agent integration

### py-sec-edgar
- **Repo**: [github.com/ryansmccoy/py-sec-edgar](https://github.com/ryansmccoy/py-sec-edgar)
- **Stars**: 120 | **Language**: Python
- **What it does**: SEC EDGAR downloader with 4 workflows: Full Index (historical bulk), Daily (recent), Monthly (XBRL), and **RSS (real-time feed monitoring)**.
- **How we use it**: **Reference for the RSS real-time polling pattern.** Their `workflows rss` command demonstrates how to poll SEC EDGAR's RSS feed for new filings in near-real-time. We adapt this approach for our SEC scanner's polling loop.
- **Key patterns we borrow**:
  - RSS feed polling with configurable intervals
  - Ticker/form-type filtering at the scan level
  - Error handling + retry logic for SEC rate limits

### TradingView Lightweight Charts
- **Repo**: [github.com/tradingview/lightweight-charts](https://github.com/tradingview/lightweight-charts)
- **Stars**: 10,000+ | **Language**: TypeScript
- **What it does**: High-performance financial charts (candlestick, line, area) in 45KB. HTML5 Canvas rendering.
- **How we use it**: **The chart component in our dashboard.** We extend it with custom markers for event annotations — green/red triangles overlaid on price candles at the time of detected events.

---

## Architecture References (Inspire Design)

### OpenBB
- **Repo**: [github.com/OpenBB-finance/OpenBB](https://github.com/OpenBB-finance/OpenBB)
- **Stars**: 62,700+ | **Language**: Python
- **What it does**: Open-source financial data platform. Unified API across 50+ data providers. Web-based Workspace UI.
- **What we learn from it**:
  - **Provider plugin architecture** — Each data source is a self-contained provider with a standard interface. We model our Scanner plugins the same way: implement a common interface, register with the system, run independently.
  - **Multi-source data normalization** — Different providers return data in different formats. OpenBB normalizes everything. We do the same with our unified Event schema.
  - **Workspace UI concept** — Customizable dashboard with widgets. Inspirational for our panel-based layout.
- **Why we don't just use it**: OpenBB is a research/analysis platform, not a real-time monitoring system. No sub-minute polling, no push alerts, no event classification.

### OpenStock
- **Repo**: [github.com/Open-Dev-Society/OpenStock](https://github.com/Open-Dev-Society/OpenStock)
- **Stars**: 9,300+ | **Language**: TypeScript (Next.js)
- **What it does**: Open-source stock tracking platform with real-time prices, alerts, and company insights. Built with Next.js + shadcn/ui + Tailwind.
- **What we learn from it**:
  - **Frontend tech stack validation** — Same stack we chose (Next.js 15, shadcn/ui, Tailwind, dark theme). Proves it works for financial dashboards.
  - **Alert system patterns** — Their price-based alert system gives us patterns for our event-based alert system.
  - **Component library** — Potential to fork/reference specific UI components (cards, tables, charts integration).
  - **Inngest for background jobs** — Their use of Inngest for async processing is worth evaluating vs our direct polling approach.
- **Why we don't just fork it**: OpenStock is price-focused, not event-focused. No SEC integration, no social media scanning, no AI classification.

### FinSight
- **Repo**: [github.com/RUC-NLPIR/FinSight](https://github.com/RUC-NLPIR/FinSight)
- **Stars**: 148 | **Language**: Python (Jupyter)
- **What it does**: AI-driven financial deep research. One ticker → publication-ready report. Multi-source data aggregation + AI analysis.
- **What we learn from it**:
  - **AI analysis pipeline** — Their flow from data collection → AI processing → structured report is a reference for our event classification pipeline.
  - **Chinese financial NLP** — If we ever expand to monitor Chinese social media (Weibo, Xueqiu), their Chinese NLP experience is valuable.
  - **Tool orchestration** — How they chain multiple API calls and AI prompts into a coherent analysis.

---

## Potential Data Source Libraries

Libraries we may integrate for specific scanners:

| Library | Purpose | Notes |
|---------|---------|-------|
| `sec-api` (npm/pip) | SEC EDGAR API wrapper | Paid ($49+/mo) but structured JSON + streaming |
| `tweepy` / X API v2 | Twitter/X monitoring | $200/mo for Basic tier |
| `praw` | Reddit API | Free, good for WSB monitoring |
| `feedparser` | RSS parsing | For PR Newswire, BusinessWire, Reuters |
| `yfinance` | Stock prices + fundamentals | Free, for enrichment |
| `playwright` | Web scraping | For sources without APIs (Truth Social, WARN Act) |

---

## Competitive Products (Closed-Source, for Feature Reference)

| Product | Key Feature We Want | Price |
|---------|-------------------|-------|
| **LevelFields** | Event type taxonomy + historical win rates | $99/mo |
| **SentryDock** | Trump Truth Social real-time tracker | $29/mo |
| **Benzinga Pro** | Sub-second news alerts + Squawk | $177/mo |
| **Unusual Whales** | Options flow + Congress trades dashboard | $30/mo |
| **QuiverQuant** | Congress + insider + alt data dashboards | $20/mo |
| **TipRanks** | Trump dashboard + analyst rating tracker | $30/mo |

Our goal: combine the best features of all of these into a single open-source platform.

---

*See [Architecture](ARCHITECTURE.md) for how these components fit together.*
*See [Roadmap](ROADMAP.md) for the build plan.*
