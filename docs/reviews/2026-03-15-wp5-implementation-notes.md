# WP5a-5c Implementation Notes

## Scope

Implemented scanner reliability hardening for WP5a-WP5c on `feat/wp5-scanner-hardening`:

- `BaseScanner.start()` now performs an immediate first poll instead of waiting one full interval.
- Added shared `scannerFetch()` timeout wrapper with `AbortController` support and composed abort signals.
- Updated HTTP scanners in scope to use `scannerFetch()` with per-scanner timeout budgets.
- Hardened `BaseScanner` timeout handling so repeated timeouts back off more gently than generic network failures.
- Replaced the hardcoded 2026 NYSE holiday set with dynamic calendar computation, including Good Friday via Computus, observed holidays, early closes, and market-close calculation.

## Files Changed

- Shared:
  - `packages/shared/src/base-scanner.ts`
  - `packages/shared/src/scanner-fetch.ts`
  - `packages/shared/src/index.ts`
  - `packages/shared/src/__tests__/base-scanner.test.ts`
  - `packages/shared/src/__tests__/scanner-fetch.test.ts`
- Backend:
  - `packages/backend/src/pipeline/market-calendar.ts`
  - `packages/backend/src/pipeline/llm-gatekeeper.ts`
  - `packages/backend/src/scanners/congress-scanner.ts`
  - `packages/backend/src/scanners/newswire-scanner.ts`
  - `packages/backend/src/scanners/fda-scanner.ts`
  - `packages/backend/src/scanners/federal-register-scanner.ts`
  - `packages/backend/src/scanners/whitehouse-scanner.ts`
  - `packages/backend/src/scanners/doj-scanner.ts`
  - `packages/backend/src/scanners/reddit-scanner.ts`
  - `packages/backend/src/scanners/stocktwits-scanner.ts`
  - `packages/backend/src/scanners/earnings-scanner.ts`
  - `packages/backend/src/scanners/halt-scanner.ts`
  - `packages/backend/src/scanners/sec-edgar-scanner.ts`
  - `packages/backend/src/__tests__/market-calendar.test.ts`

## Verification

Passing:

- `pnpm build`
- `pnpm --filter @event-radar/backend lint`
- `pnpm --filter @event-radar/shared test`
- Targeted affected-suite checks:
  - `pnpm --filter @event-radar/shared exec vitest run src/__tests__/base-scanner.test.ts src/__tests__/scanner-fetch.test.ts`
  - `pnpm --filter @event-radar/backend exec vitest run src/__tests__/market-calendar.test.ts src/__tests__/llm-judge.test.ts src/__tests__/congress-scanner.test.ts src/__tests__/newswire-scanner.test.ts src/__tests__/fda-scanner.test.ts src/__tests__/whitehouse-scanner.test.ts src/__tests__/doj-scanner.test.ts src/__tests__/reddit-scanner.test.ts src/__tests__/stocktwits-scanner.test.ts src/__tests__/earnings-scanner.test.ts src/__tests__/halt-scanner.test.ts`
  - `pnpm --filter @event-radar/backend exec vitest run src/__tests__/sec-edgar-scanner.test.ts`

Still failing:

- `pnpm --filter @event-radar/backend test`

The full backend suite currently reports a large set of failures outside WP5 scope, including unrelated scanner suites (`analyst`, `breaking-news`, `dilution`, `ir-monitor`, `options`, `short-interest`, `truth-social`, `x`), integration timeout cases, and some API/watchlist feedback tests. I did not roll those broader failures into this WP5 change set.
