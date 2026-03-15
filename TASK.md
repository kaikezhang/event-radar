# TASK.md — WP5a-5c: Scanner Reliability Hardening

> Reference: `docs/plans/2026-03-15-phase3-productization-v2.md` (WP5a, WP5b, WP5c)

## Goal
Fix three scanner reliability issues: immediate first poll, fetch timeouts, and NYSE holiday computation.

## WP5a: Immediate First Poll

### File: `packages/shared/src/base-scanner.ts`

Change `start()` to do an immediate first poll instead of waiting one full interval:

```typescript
start(): void {
  if (this._running) return;
  this._running = true;
  void this.tick(); // immediate first poll, then schedule next
}
```

Currently it calls `this.scheduleNext()` which sets a `setTimeout` — meaning after restart, scanners are blind for their full poll interval (5-30 minutes).

**Note**: The app has a 90-second delivery grace period (`app.ts:~600`) that suppresses delivery on startup. Events from the immediate first poll will be stored to DB but not delivered during grace period. This is fine — the grace period audit record already marks them as `outcome: 'grace_period'`. No changes needed there.

### Tests
- Update `base-scanner.test.ts` if it asserts on `scheduleNext()` behavior in `start()`
- Add test: scanner polls immediately on start (not after interval)

## WP5b: Fetch Timeout

### New File: `packages/shared/src/scanner-fetch.ts`

Create a `scannerFetch()` utility that wraps `fetch()` with an `AbortController` timeout:

```typescript
export async function scannerFetch(
  url: string | URL,
  options?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const controller = new AbortController();
  // Compose with any existing signal from caller
  const existingSignal = options?.signal;
  const signal = existingSignal
    ? AbortSignal.any([existingSignal, controller.signal])
    : controller.signal;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { timeoutMs: _, ...fetchOptions } = options ?? {};
    return await fetch(url, { ...fetchOptions, signal });
  } finally {
    clearTimeout(timeout);
  }
}
```

### Update `base-scanner.ts` — Timeout vs Backoff
In `scan()`, catch `AbortError` (timeout) separately from network errors:
- Timeout errors should NOT trigger aggressive exponential backoff
- Add `_timeoutErrors` counter
- Only trigger backoff after **3 consecutive** timeouts (more lenient)
- Log timeout differently: "Scanner X: request timed out after 30s" vs "Scanner X: network error"

### Update Scanners
Replace `fetch()` with `scannerFetch()` in these HTTP scanners (browser-based scanners already have Crawlee timeouts):
- `packages/backend/src/scanners/congress-scanner.ts` — timeoutMs: 60_000 (slow API)
- `packages/backend/src/scanners/newswire-scanner.ts` — timeoutMs: 30_000
- `packages/backend/src/scanners/fda-scanner.ts` — timeoutMs: 30_000
- `packages/backend/src/scanners/sec-edgar-scanner.ts` — timeoutMs: 30_000
- `packages/backend/src/scanners/federal-register-scanner.ts` — timeoutMs: 30_000
- `packages/backend/src/scanners/whitehouse-scanner.ts` — timeoutMs: 30_000
- `packages/backend/src/scanners/doj-scanner.ts` — timeoutMs: 30_000
- `packages/backend/src/scanners/reddit-scanner.ts` — timeoutMs: 15_000
- `packages/backend/src/scanners/stocktwits-scanner.ts` — timeoutMs: 15_000
- `packages/backend/src/scanners/econ-calendar-scanner.ts` — timeoutMs: 30_000
- `packages/backend/src/scanners/halt-scanner.ts` — timeoutMs: 15_000
- `packages/backend/src/scanners/earnings-scanner.ts` — timeoutMs: 30_000

Do NOT change browser-based scanners (x-scanner, truth-social-scanner) — they use Crawlee.

### Tests
- Unit test for `scannerFetch()`: verify timeout fires, verify abort signal composition
- Integration: verify BaseScanner doesn't enter aggressive backoff on timeout

## WP5c: NYSE Holiday Dynamic Computation

### File: `packages/backend/src/pipeline/llm-gatekeeper.ts`

Replace hardcoded `NYSE_HOLIDAYS_2026` with a dynamic computation function.

#### Requirements
1. Fixed holidays (with observed rules — Sat→preceding Fri, Sun→following Mon):
   - New Year's Day (Jan 1)
   - MLK Day (3rd Monday of January)
   - Presidents' Day (3rd Monday of February)
   - Juneteenth (June 19, since 2022)
   - Independence Day (July 4)
   - Labor Day (1st Monday of September)
   - Thanksgiving (4th Thursday of November)
   - Christmas (December 25)

2. Good Friday (variable — needs Easter/Computus algorithm):
   - Easter Sunday is the first Sunday after the first full moon on or after March 21
   - Use the anonymous Gregorian algorithm (Computus) to compute Easter date
   - Good Friday = Easter Sunday - 2 days
   - NYSE always closes for Good Friday

3. Early closings (1:00 PM ET):
   - Day before Independence Day (July 3, if weekday)
   - Day after Thanksgiving (Black Friday)
   - Christmas Eve (Dec 24, if weekday)
   - Add `isEarlyClose(date: Date): boolean` function
   - Add `getMarketCloseTime(date: Date): Date` function (returns 1pm ET for early close, 4pm ET normally)

#### Implementation
- Create a new file: `packages/backend/src/pipeline/market-calendar.ts`
- Export: `isNYSEHoliday(date: Date): boolean`, `isEarlyClose(date: Date): boolean`, `getMarketCloseTime(date: Date): Date`, `getNYSEHolidaysForYear(year: number): string[]`
- Update `llm-gatekeeper.ts` to import from `market-calendar.ts` instead of using hardcoded set
- Update `getMarketSession()` to use `getMarketCloseTime()` for early close awareness

#### Tests — THOROUGH!
- Verify 2025 holidays (known dates)
- Verify 2026 holidays (matches the current hardcoded set)
- Verify 2027 holidays
- Verify 2028 holidays (leap year)
- Verify Good Friday dates: 2025-04-18, 2026-04-03, 2027-03-26, 2028-04-14
- Verify observed rules: e.g., July 4 on Saturday → July 3 closed; Christmas on Sunday → Dec 26 closed
- Verify early closings
- Edge case: New Year's Day on Saturday (2028) → Dec 31, 2027 closed

## PR
- Branch: `feat/wp5-scanner-hardening` (already created)
- Title: "feat: scanner reliability hardening — immediate poll, fetch timeout, dynamic NYSE calendar"
- Run ALL tests before creating PR: `pnpm --filter @event-radar/backend test && pnpm --filter @event-radar/shared test`
- Create PR and STOP. Do not merge.
