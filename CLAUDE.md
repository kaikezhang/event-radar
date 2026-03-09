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

## Current Task: P1B.2 Tier 2 Political Figure Scanners

**Goal**: Add Trump Truth Social + Elon Musk X scanners as Tier 2 sources.

### Architecture

Each scanner is a standalone class extending `BaseScanner`. They emit `RawEvent` via the event bus. The existing rule engine + LLM classifier handle classification.

Since Truth Social and X have no official API suitable for free real-time polling, we use **web scraping via Crawlee** (Playwright-based) with anti-detection. Both scanners poll on tight intervals (Trump 15s, Elon 30s) and emit new posts as events.

### Requirements

1. **Crawlee integration** — shared browser scraping utility
   - Add `crawlee` + `playwright` as backend dependencies
   - Create `src/scanners/scraping/browser-pool.ts` — shared Playwright browser pool
     - Singleton pattern, lazy init, graceful shutdown
     - Headless Chromium, stealth mode (Crawlee handles most fingerprinting)
   - Create `src/scanners/scraping/scrape-utils.ts` — common scraping helpers
     - `extractTextContent(page, selector)`, `waitForContent(page, selector, timeout)`
     - Rate limit tracking, retry with backoff

2. **Trump Truth Social Scanner** — `src/scanners/truth-social-scanner.ts`
   - Poll `https://truthsocial.com/@realDonaldTrump` every 15s
   - Extract: post text, timestamp, media URLs, repost indicator
   - Dedup by post ID (track last N seen IDs)
   - Emit `RawEvent` with:
     - `source: 'truth-social'`
     - `type: 'political-post'`
     - `metadata: { author: 'trump', postId, isRepost, hasMedia }`
   - **Fallback**: If direct scraping fails 3x consecutively, log warning + emit scanner health degraded
   - Handle: page load failures, rate limits, DOM structure changes (use resilient selectors)

3. **Elon Musk X Scanner** — `src/scanners/x-scanner.ts`
   - Poll `https://x.com/elonmusk` every 30s
   - Extract: tweet text, timestamp, media, retweet/quote indicator, reply indicator
   - Filter: only original tweets + quotes (skip replies unless they contain $TICKER or market keywords)
   - Dedup by tweet ID
   - Emit `RawEvent` with:
     - `source: 'x'`
     - `type: 'political-post'`
     - `metadata: { author: 'elonmusk', tweetId, isRetweet, isQuote, hasMedia }`
   - **Anti-detection**: X is aggressive — use Crawlee's SessionPool, rotate user agents, respect rate limits
   - **Fallback**: same as Trump scanner — 3 consecutive failures → health degraded

4. **Political post classification rules** — `src/pipeline/political-rules.ts`
   - Add new rules to the rule engine for political posts:
     - Trump + tariff/trade keywords → CRITICAL severity
     - Trump + company name mention → HIGH severity  
     - Trump + crypto keywords → HIGH severity
     - Elon + DOGE/government keywords → HIGH severity
     - Elon + Tesla/SpaceX keywords → MEDIUM severity (often already public)
     - Elon + crypto keywords → HIGH severity
   - Export and register in `default-rules.ts`

5. **Scanner registration**
   - Register both scanners in the scanner registry
   - Add env vars: `TRUTH_SOCIAL_ENABLED=true/false`, `X_SCANNER_ENABLED=true/false`
   - Both disabled by default (require explicit opt-in since they need a browser)

6. **Tests** (≥10 new tests)
   - Unit tests for post text extraction/parsing (mock HTML fixtures)
   - Unit tests for dedup logic (seen IDs ring buffer)
   - Unit tests for political classification rules
   - Test scanner health degradation after consecutive failures
   - Test fallback behavior
   - DO NOT test with real network calls — use mock HTML pages

### Dependencies to add (packages/backend)
- `crawlee` (Playwright crawler)
- `playwright` (browser automation)

### Files to create
- `packages/backend/src/scanners/scraping/browser-pool.ts`
- `packages/backend/src/scanners/scraping/scrape-utils.ts`
- `packages/backend/src/scanners/truth-social-scanner.ts`
- `packages/backend/src/scanners/x-scanner.ts`
- `packages/backend/src/pipeline/political-rules.ts`
- `packages/backend/src/__tests__/truth-social-scanner.test.ts`
- `packages/backend/src/__tests__/x-scanner.test.ts`
- `packages/backend/src/__tests__/political-rules.test.ts`
- `packages/backend/src/__tests__/fixtures/truth-social-post.html`
- `packages/backend/src/__tests__/fixtures/x-tweet.html`

### Verification
`turbo build && turbo test && turbo lint` must pass. Browser/Playwright NOT required for tests (all mocked).

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
