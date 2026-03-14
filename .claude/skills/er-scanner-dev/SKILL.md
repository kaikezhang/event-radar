# Event Radar — Scanner Development

You are building a new scanner for Event Radar. Follow these patterns exactly.

## Scanner Architecture

Every scanner extends `BaseScanner` from `@event-radar/shared`. You implement ONE method: `poll()`.

```typescript
import { BaseScanner, ok, err, type EventBus, type RawEvent, type Result } from '@event-radar/shared';

export class MyScanner extends BaseScanner {
  constructor(eventBus: EventBus) {
    super({
      name: 'my-scanner',
      source: 'my-source',
      pollIntervalMs: 60_000,
      eventBus,
    });
  }

  protected async poll(): Promise<Result<RawEvent[], Error>> {
    // fetch → parse → return ok([events]) or err(new Error(...))
  }
}
```

## Mandatory Patterns

### 1. Dedup with SeenIdBuffer
```typescript
import { SeenIdBuffer } from './scraping/scrape-utils.js';
private readonly seen = new SeenIdBuffer(1000); // bounded!

// In poll():
if (this.seen.has(id)) continue;
this.seen.add(id);
```

### 2. Fetch with timeout + User-Agent
```typescript
const res = await fetch(url, {
  headers: { 'User-Agent': 'EventRadar/1.0 (market-monitor)' },
  signal: AbortSignal.timeout(10_000),
});
if (!res.ok) return err(new Error(`HTTP ${res.status}`));
```

### 3. RawEvent shape
```typescript
const event: RawEvent = {
  id: randomUUID(),
  source: this.source,
  sourceId: `${this.source}:${externalId}`,
  title: 'Short descriptive title',
  description: 'Full text content',
  url: 'https://original-source-url',
  timestamp: new Date(/* from source */),
  metadata: { /* source-specific fields */ },
};
```

### 4. Ticker extraction
```typescript
import { extractTickers } from './ticker-extractor.js';
const tickers = extractTickers(`${title} ${description}`);
if (tickers.length) event.metadata.tickers = tickers;
```

### 5. Error handling — NEVER throw
```typescript
// ✅ Correct
return err(new Error('Rate limited'));

// ❌ Wrong
throw new Error('Rate limited');
```

## Registration

Add scanner to `packages/backend/src/scanners/index.ts` and register in scanner manager.

## Test Requirements

- ≥10 tests in `packages/backend/src/__tests__/`
- Mock all HTTP calls with `vi.fn()`
- Test: happy path, empty response, HTTP error, malformed data, rate limit, timeout
- Test: dedup (same ID twice → only one event)
- All tests < 10s

## Checklist Before PR

- [ ] Extends `BaseScanner`, implements `poll()` returning `Result`
- [ ] `SeenIdBuffer` with bounded size
- [ ] `fetch` has timeout via `AbortSignal.timeout()`
- [ ] User-Agent header set
- [ ] `RawEvent` includes `sourceId` for cross-scanner dedup
- [ ] Ticker extraction if applicable
- [ ] Registered in scanner index
- [ ] ≥10 tests, all passing
- [ ] `pnpm build && pnpm --filter @event-radar/backend lint` passes
- [ ] Feature branch + PR, NOT pushed to main
