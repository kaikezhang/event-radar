# Event Radar

Real-time event-driven trading intelligence platform. Monitors 30+ sources (SEC filings, political social media, macro data), classifies events with AI, and pushes alerts to iOS/Telegram/Discord/Dashboard.

## Tech Stack

TypeScript monorepo (Turborepo). Backend: Fastify. Frontend: Next.js 15 + shadcn/ui + Tailwind. DB: PostgreSQL. Testing: Vitest + Playwright. SEC parsing: Python microservice (FastAPI + edgartools).

## Structure

```
packages/shared/     — types, interfaces, schemas (zod)
packages/backend/    — Fastify server, scanners, pipeline, delivery
packages/frontend/   — Next.js 15 dashboard
packages/sec-service/— Python FastAPI microservice
```

## Commands

- `turbo build` — build all packages
- `turbo test` — run all tests (Vitest)
- `turbo lint` — ESLint check
- `docker compose up` — start all services locally

## Key Constraints

- Use zod for all validation. Result<T,E> pattern for errors, don't throw.
- Env vars via `@t3-oss/env-core`. Never hardcode secrets.
- One scanner per file. Scanners only extract data — no classification logic.
- Virtual list: @tanstack/virtual (NOT AG Grid). DB: PostgreSQL (NOT SQLite).
- Event bus interface: EventEmitter now, Redis Streams later. Don't couple to implementation.

## Verification

After any change: `turbo build && turbo test && turbo lint` must all pass.

## Tasks

Read `tasks.md` for current task and development plan.

## Current Task: P1C.1 Tier 3 Corporate Newswire Scanners

**Goal**: Add RSS-based scanners for the 3 major corporate newswires: PR Newswire, BusinessWire, GlobeNewswire.

### Architecture

Unlike Tier 2 (browser scraping), these sources provide proper RSS feeds — much simpler and more reliable. Each scanner polls an RSS feed, parses entries, extracts ticker/company info, and emits `RawEvent`.

### Requirements

1. **RSS parser utility** — `src/scanners/rss/rss-parser.ts`
   - Wrap `rss-parser` npm package
   - Generic RSS/Atom feed fetcher with timeout (10s) and retry (3x with backoff)
   - Returns parsed items with: title, link, pubDate, content/description, guid
   - Handle malformed feeds gracefully (Result pattern)

2. **PR Newswire Scanner** — `src/scanners/pr-newswire-scanner.ts`
   - Feed URL: `https://www.prnewswire.com/rss/all-news-releases.rss`
   - Poll interval: 60s
   - Extract: headline, company name, ticker (from title/body patterns like `(NASDAQ: AAPL)`)
   - Emit `RawEvent` with `source: 'pr-newswire'`, `type: 'press-release'`
   - Dedup by guid

3. **BusinessWire Scanner** — `src/scanners/businesswire-scanner.ts`
   - Feed URL: `https://feed.businesswire.com/rss/home/?rss=G1QFDERJXkJeEFpRWg==`
   - Poll interval: 60s
   - Same extraction logic as PR Newswire
   - Emit `RawEvent` with `source: 'businesswire'`, `type: 'press-release'`

4. **GlobeNewswire Scanner** — `src/scanners/globenewswire-scanner.ts`
   - Feed URL: `https://www.globenewswire.com/RSSFeed/country/United%20States/feedTitle/GlobeNewswire%20-%20News%20Releases%20for%20USA`
   - Poll interval: 60s
   - Emit `RawEvent` with `source: 'globenewswire'`, `type: 'press-release'`

5. **Ticker extraction utility** — `src/scanners/rss/ticker-extractor.ts`
   - Regex patterns to extract stock tickers from press release text
   - Match patterns: `(NYSE: XYZ)`, `(NASDAQ: XYZ)`, `(TSX: XYZ)`, `$XYZ`
   - Return array of found tickers
   - Handle edge cases: multiple tickers, false positives (common words like $USD)

6. **Press release classification rules** — add to `src/pipeline/default-rules.ts`
   - Press release + merger/acquisition keywords → HIGH
   - Press release + earnings/guidance keywords → HIGH
   - Press release + FDA/drug approval keywords → HIGH
   - Press release + executive change keywords → MEDIUM
   - Press release + partnership keywords → MEDIUM
   - Default press release → LOW

7. **Scanner registration**
   - Register all 3 in scanner registry
   - Env vars: `PR_NEWSWIRE_ENABLED`, `BUSINESSWIRE_ENABLED`, `GLOBENEWSWIRE_ENABLED` (all default true)

8. **Tests** (≥12 new tests)
   - RSS parser: valid feed, malformed feed, timeout, empty feed
   - Ticker extractor: NYSE pattern, NASDAQ pattern, $TICKER pattern, multiple tickers, no tickers, false positives
   - Each scanner: parse mock RSS XML → emit correct RawEvents
   - Press release classification rules
   - DO NOT make real network calls — use mock RSS XML fixtures

### Dependencies to add (packages/backend)
- `rss-parser`

### Files to create
- `packages/backend/src/scanners/rss/rss-parser.ts`
- `packages/backend/src/scanners/rss/ticker-extractor.ts`
- `packages/backend/src/scanners/pr-newswire-scanner.ts`
- `packages/backend/src/scanners/businesswire-scanner.ts`
- `packages/backend/src/scanners/globenewswire-scanner.ts`
- `packages/backend/src/__tests__/rss-parser.test.ts`
- `packages/backend/src/__tests__/ticker-extractor.test.ts`
- `packages/backend/src/__tests__/newswire-scanners.test.ts`
- `packages/backend/src/__tests__/fixtures/mock-rss-feed.xml`

### Verification
`turbo build && turbo test && turbo lint` must pass.

## Reference Docs

Read these when working on the relevant area:

- `docs/ARCHITECTURE.md` — system design, event bus, backpressure, Python/TS boundary, auth
- `docs/SOURCES.md` — all 30+ data sources by tier
- `docs/FRONTEND.md` — dashboard panels, UX spec, keyboard shortcuts
- `docs/DELIVERY.md` — Bark/Telegram/Discord/webhook alert routing
- `docs/ROADMAP.md` — phased development plan with milestones
- `docs/REFERENCES.md` — open-source projects to integrate
- `docs/REVIEW.md` — architecture review findings

## Git

Conventional Commits: `feat(scanner): add SEC 8-K polling`. Branch: `feat/`, `fix/`, `docs/`. Squash merge PRs. Never push directly to main for non-trivial changes.
