# Event Radar — Pipeline Debug

You are debugging an issue in the Event Radar pipeline. Trace events systematically from source to delivery.

## Pipeline Flow

```
Scanner.poll() → EventBus.publish(RawEvent)
  → Deduplicator (sourceId match)
  → LLM Gatekeeper (GPT-4o-mini, 5s timeout, fail-open)
  → LLM Classifier (event type, severity, confidence)
  → Historical Enricher (similar past events)
  → Rule Engine (macro/political rules)
  → Alert Filter (budget, cooldown, similarity)
  → Story Tracker (group related events)
  → Delivery (Discord, Bark, Telegram, webhook)
```

## Debug Workflow

### Step 1: Identify where it broke

| Symptom | Likely stage | Check |
|---------|-------------|-------|
| No events at all | Scanner | `GET /api/v1/scanners/health` — is it healthy? |
| Events appear but no alerts | Filter/Classifier | Check audit trail: was it filtered or classified low? |
| Duplicate alerts | Deduplicator | Check `sourceId` format — is it consistent? |
| Wrong severity | Classifier | Check LLM prompt + response in audit log |
| Alert sent but not received | Delivery | Check delivery channel config + webhook URL |
| Scanner healthy but no new events | Source API | Is the source rate-limiting or returning empty? |

### Step 2: Use the AI Observability APIs

```bash
# Overall health
curl -H "x-api-key: er-dev-2026" http://localhost:3001/api/v1/ai/pulse?window=30m

# Trace a specific event through the full pipeline
curl -H "x-api-key: er-dev-2026" http://localhost:3001/api/v1/ai/trace/<eventId>

# Scanner deep dive (last 7 days)
curl -H "x-api-key: er-dev-2026" http://localhost:3001/api/v1/ai/scanner/<name>?days=7

# Daily report with signal validation
curl -H "x-api-key: er-dev-2026" http://localhost:3001/api/v1/ai/daily-report?date=2026-03-14
```

### Step 3: Check DB directly

```sql
-- Recent events from a scanner
SELECT id, source, title, created_at FROM events
WHERE source = 'scanner-name' ORDER BY created_at DESC LIMIT 10;

-- Check if event was classified
SELECT e.id, e.title, c.event_type, c.severity, c.confidence
FROM events e LEFT JOIN classifications c ON e.id = c.event_id
WHERE e.id = 'event-uuid';

-- Check if alert was created
SELECT * FROM alerts WHERE event_id = 'event-uuid';

-- Check outcome backfill
SELECT id, title, outcome_direction, change_1d, outcome_evaluated_at
FROM events WHERE outcome_evaluated_at IS NOT NULL
ORDER BY outcome_evaluated_at DESC LIMIT 10;
```

DB connection: `postgresql://radar:radar@localhost:5432/event_radar`

### Step 4: Check logs

```bash
# Docker logs for the backend
docker logs event-radar-backend --tail 100 --since 1h

# Filter for specific scanner
docker logs event-radar-backend 2>&1 | grep -i "scanner-name"

# Filter for errors
docker logs event-radar-backend 2>&1 | grep -iE "(error|fail|crash)"
```

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Scanner shows `down` | ≥3 consecutive errors | Check API accessibility, rate limits |
| Scanner in `backoff` | ≥5 consecutive errors | Exponential backoff active, check source API |
| LLM gatekeeper blocking too much | Prompt too strict | Check `llm-gatekeeper.ts` prompt wording |
| Outcome backfill not running | `processOutcomes()` not called | Check cron schedule in server startup |
| `change_1d` looks wrong | It's percentage (3.0 = 3%) | Not a bug, just the unit |
| Alert similarity filter | Recent similar alert blocked it | Check `alert-filter.ts` similarity threshold |

## Output Format

After debugging, summarize:
```
## 🔍 Debug Report

**Symptom**: [what was observed]
**Root Cause**: [what actually went wrong]
**Stage**: [which pipeline stage]
**Fix**: [what to do]
**Evidence**: [log lines, DB queries, API responses]
```
