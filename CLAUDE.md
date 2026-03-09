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

## Current Task: P1A.5 Integration Tests

**Goal**: End-to-end integration tests verifying the complete pipeline.

### Requirements

1. **Full pipeline tests**: scanner → ingest → rule engine classify → delivery
   - Test with 8-K scanner events flowing through classify → delivery
   - Test with Form 4 scanner events flowing through classify → delivery
   - Mock external dependencies (SEC EDGAR API, Bark/Discord HTTP calls)

2. **Metrics integration**: Verify Prometheus counters increment correctly after pipeline runs
   - scanner_events_total increments after scan
   - events_classified_total increments after classification
   - delivery_attempts_total increments after delivery

3. **Error scenarios**:
   - Scanner failure → metrics still recorded, no crash
   - Delivery failure → retry logic, error metrics incremented
   - Invalid event data → rejected gracefully with error metrics

4. **Test infrastructure**:
   - Use Vitest for all tests
   - Mock HTTP calls with msw or manual mocks (no real network)
   - If DB needed, mock the query layer (don't require running Postgres)
   - Place integration tests in `src/__tests__/integration/` directory

5. **Target**: ≥10 new integration tests

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
