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

## Current Task: P1B.3 Event Deduplication

**Goal**: Cross-source event deduplication — same event from multiple sources should be merged, not duplicated.

### Architecture

Dedup runs as a pipeline stage between classification and delivery. When a new event arrives, it checks against recent events (sliding window) for duplicates. If a match is found, the new event is merged into the existing one (boosting confidence, adding source) rather than creating a separate alert.

### Requirements

1. **`EventDeduplicator` class** in `src/pipeline/deduplicator.ts`
   - Maintains a sliding window of recent events (configurable, default 30 minutes)
   - For each incoming classified event, checks for duplicates
   - Returns: `{ isDuplicate: boolean, mergedEvent?: ClassifiedEvent, originalEventId?: string }`

2. **Dedup strategies** (all in `src/pipeline/dedup-strategies.ts`)
   - **Exact ID match**: same `metadata.filingId`, `metadata.postId`, `metadata.tweetId` etc.
   - **Ticker + time window**: same ticker within 5 minutes + similar event type
   - **Content similarity**: title/body similarity score > 0.8 (use simple Jaccard similarity on word tokens — no ML needed)
   - **Developing story grouping**: related events within 30min window get grouped under a "story" ID
   - Each strategy returns a confidence score (0-1), highest wins

3. **Shared types** in `packages/shared/src/schemas/dedup.ts`
   ```typescript
   DedupResult {
     isDuplicate: boolean
     matchType: 'exact-id' | 'ticker-window' | 'content-similarity' | 'none'
     matchConfidence: number  // 0-1
     originalEventId?: string
     storyId?: string  // for developing story grouping
   }
   ```

4. **Story grouping** in `src/pipeline/story-tracker.ts`
   - Groups related events into "stories" (e.g., multiple 8-Ks about same merger)
   - Story = first event's ID, subsequent events reference it
   - Story expires after 30 minutes of no new related events
   - Metadata enrichment: `event.metadata.storyId`, `event.metadata.storyEventCount`

5. **Pipeline integration**
   - Insert dedup stage: scanner → classify → **dedup** → delivery
   - If duplicate: skip delivery, update existing event's metadata (add source, bump confidence)
   - If new story event: deliver with "Developing: ..." prefix in title
   - Add Prometheus metrics: `events_deduplicated_total` (counter), `active_stories` (gauge)

6. **Tests** (≥10 new tests)
   - Exact ID dedup (same filing from RSS + API)
   - Ticker + time window dedup (Trump tariff post + news article about it)
   - Content similarity (similar headlines from different newswires)
   - Story grouping (3 related events → 1 story)
   - Story expiry (old story not matched)
   - Non-duplicate events pass through
   - Sliding window cleanup (old events removed)
   - Metrics increment correctly

### Files to create/modify
- `packages/shared/src/schemas/dedup.ts` (new)
- `packages/shared/src/index.ts` (export new types)
- `packages/backend/src/pipeline/deduplicator.ts` (new)
- `packages/backend/src/pipeline/dedup-strategies.ts` (new)
- `packages/backend/src/pipeline/story-tracker.ts` (new)
- `packages/backend/src/app.ts` (integrate dedup stage)
- `packages/backend/src/metrics.ts` (add dedup metrics)
- `packages/backend/src/__tests__/deduplicator.test.ts` (new)
- `packages/backend/src/__tests__/story-tracker.test.ts` (new)

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
