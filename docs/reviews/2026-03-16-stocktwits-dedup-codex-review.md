# StockTwits Dedup Plan Review

## Findings

1. High: the plan misstates the current duplicate behavior and then designs a broader policy change around that incorrect premise. `StockTwitsScanner.pollTrending()` only emits a trending event when `previousTrending` does not contain the ticker, then replaces `previousTrending` with the current set at the end of the poll (`packages/backend/src/scanners/stocktwits-scanner.ts:156-178`). The existing test suite also asserts that the second poll does not emit duplicate trending events (`packages/backend/src/__tests__/stocktwits-scanner.test.ts:129-153`). So the current bug is restart volatility, not "every poll cycle" spam. The proposed 24h prune/cooldown logic in `docs/plans/2026-03-16-stocktwits-dedup.md:72-107` is therefore not a minimal fix; it changes semantics from "emit on re-entry" to "suppress re-entry for 24h".

2. High: the proposed `SeenIdBuffer` usage does not match the actual API, so the sample implementation would not work. In the real implementation, `SeenIdBuffer.add(id)` returns `void`, not `boolean`, and the class exposes no `remove()` or `entries()` methods (`packages/backend/src/scanners/scraping/scrape-utils.ts:88-105`). That means `if (this.seenTrending.add(sym.symbol))` in the plan (`docs/plans/2026-03-16-stocktwits-dedup.md:53-60`) would never emit events, `this.seenTrending.entries?.()` would evaluate to `[]`, and `this.seenTrending.remove(ticker)` would fail unless the utility is extended first.

3. Medium: even if `SeenIdBuffer` were extended, the proposed `pruneNonTrending` design is still not correct for the stated goal because the cooldown state is not persisted. `trendingExitTimes` in the plan is an in-memory `Map` (`docs/plans/2026-03-16-stocktwits-dedup.md:81-105`). After a restart, all remembered exit times are lost, so previously seen-but-not-currently-trending tickers would start a fresh 24h cooldown from process boot, not from when they actually left trending. That makes restart behavior nondeterministic and can over-suppress legitimate re-entries.

4. Medium: the "remove unused `previousVolumes`" cleanup is incorrect. `previousVolumes` is used to detect >2x message-count spikes in `pollSymbolStream()` and is updated on every poll (`packages/backend/src/scanners/stocktwits-scanner.ts:235-262`). Only `previousTrending`, `seenTrending`, and `seenMessages` are unused or redundant in the current trending path; `previousVolumes` is not.

5. Medium: the cleanup SQL only cleans the `events` table and leaves audit noise behind. `pipeline_audit` stores the scanner event ID as a plain `varchar` (`packages/backend/src/db/schema.ts:24-31`), and the app records `event.id` into that table before/after pipeline decisions (`packages/backend/src/app.ts:549-556`). Deleting from `events` will cascade into tables that reference `events.id` directly, such as `event_outcomes`, `classification_predictions`, and `classification_outcomes` (`packages/backend/src/db/schema.ts:97-168`), but it will not remove the corresponding `pipeline_audit` rows because those are not foreign-keyed to `events.id`. So observability counts and audit history would still reflect the duplicates.

## Answers

### 1. `packages/backend/src/scanners/stocktwits-scanner.ts` current behavior

- `previousTrending` is the only mechanism used for trending dedup right now.
- `seenTrending` and `seenMessages` are declared but unused (`packages/backend/src/scanners/stocktwits-scanner.ts:95-97`).
- On the first poll after process start, every currently trending symbol emits a `social-trending` event because `previousTrending` starts empty (`packages/backend/src/scanners/stocktwits-scanner.ts:156-173`).
- On subsequent polls in the same process, a symbol only emits again if it disappeared from the prior poll and later reappeared, because `previousTrending` is replaced with `currentTrending` at the end of each poll (`packages/backend/src/scanners/stocktwits-scanner.ts:154-178`).
- Restarting the process resets `previousTrending`, so all currently trending symbols emit again after restart.
- `previousVolumes` and `previousSentiments` are used for stream-based volume-spike and sentiment-flip detection and are unrelated to the trending dedup bug.

### 2. `SeenIdBuffer` API

- `add(id)` exists, but it returns `void`, not `boolean` (`packages/backend/src/scanners/scraping/scrape-utils.ts:93-102`).
- `remove()` does not exist.
- `entries()` does not exist.
- `has(id)` and `size` do exist (`packages/backend/src/scanners/scraping/scrape-utils.ts:88-105`).
- Persistence is real when a `name` is provided outside tests, and it writes to `/tmp/event-radar-seen/<name>.json` (`packages/backend/src/scanners/scraping/scrape-utils.ts:73-85`).

### 3. Is the proposed `pruneNonTrending` logic correct?

No.

- It depends on nonexistent `SeenIdBuffer.entries()` and `SeenIdBuffer.remove()`.
- It assumes `add()` returns a boolean.
- It implements a new 24h re-entry suppression policy, not just restart-safe state tracking.
- Its cooldown timestamps are in memory only, so restart behavior is wrong.

If the product requirement is truly "only emit when the ticker re-enters after being absent long enough", then the scanner needs a persisted ticker-state map with timestamps, not a plain ring buffer.

### 4. Better approach: `SeenIdBuffer` or alert-filter cooldown?

Neither as proposed.

- `alert-filter` is the wrong layer for this specific problem because it runs after the event has already been created and stored. It would reduce downstream delivery noise, but not the database flood the plan is trying to fix (`packages/backend/src/pipeline/alert-filter.ts:383-415`).
- Reusing `SeenIdBuffer` as-is is also a poor fit because it is an append-only ring buffer, not a timestamped state store.

The better approach is scanner-side persistence, but with a dedicated persisted map keyed by ticker, for example:

- `ticker -> currentlyTrending`
- or `ticker -> lastSeenTrendingAt / lastExitedAt`

That keeps the fix at the source of duplication and avoids storing duplicate `events` rows. If the team wants to borrow an implementation pattern, the persistence and pruning approach in `AlertFilter` is the better model than `SeenIdBuffer`, but the state should live in the StockTwits scanner, not in delivery filtering.

If forced to choose between the two options in the plan, scanner-side persistence is better than alert-filter cooldown because it prevents duplicate rows from being written at all.

### 5. Will the cleanup SQL work correctly?

Partially.

- The SQL is syntactically valid Postgres.
- It will keep the earliest matching StockTwits trending row per `ticker` and per UTC `DATE(created_at)`.
- It will also cascade-delete dependent rows that reference `events.id`.

But there are important limitations:

- It does not clean `pipeline_audit`, so duplicate audit history remains.
- It groups by `DATE(created_at)`, which is a coarse proxy for the bug. That is not the same thing as "same trending session" or "within 24h of the prior event".
- It assumes `created_at` is the right time basis for cleanup. For this repo, `created_at` is row creation time, while the scanner event itself uses `event.timestamp` and is stored as `received_at` (`packages/backend/src/db/event-store.ts:87-104`).

So: acceptable as a one-off best-effort cleanup of duplicate `events` rows, but not a complete or semantically exact fix for the overall duplicate footprint.
