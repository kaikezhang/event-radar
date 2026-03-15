# TASK.md — WP7: Provenance Display

> Reference: `docs/plans/2026-03-15-phase3-productization-v2.md` (WP7)

## Goal
Every alert shows where it came from and why it passed filters — "Why This Alert" section.

## EventDetail Page — "Why This Alert" Section

### File: `packages/web/src/pages/EventDetail.tsx`
Add a new section (after the existing Trust and Verification block) that shows:

1. **Source**: icon + name + freshness ("SEC EDGAR · 2m ago")
2. **Filter path**: "Passed L1 rule filter → L2 LLM judge (confidence 0.82) → Enriched with market context"
3. **Historical match rationale**: "Matched 14 similar FDA approvals for oversold biotech stocks"
4. **Confirmation**: "Also reported by: PR Newswire (1m later)" — if `confirmationCount > 1`

### Data Source
Read from `pipeline_audit` table via existing API:
- `GET /api/events/:id` already returns event data with audit info
- May need to extend the response to include audit trail fields: `stoppedAt`, `reason`, `classificationConfidence`, `llmReason`
- Check `packages/backend/src/routes/events.ts` for the detail endpoint

### Backend Enhancement
If the event detail API doesn't return enough audit data:
- Join `pipeline_audit` on the event detail query
- Return: `{ audit: { outcome, reason, stoppedAt, confidence, llmReason, enrichedAt } }`

## AlertCard — Source Badge
### File: `packages/web/src/components/AlertCard.tsx`
- Show source icon + relative time in a subtle badge
- Source hit-rate badge already exists via `getTrustCue()` in Feed.tsx — make sure it's wired through

## Delivery Templates
### Discord (`packages/delivery/src/discord-webhook.ts`)
- Add "Source" field: `SEC EDGAR · <t:timestamp:R>` (Discord relative timestamp)

### Bark (`packages/delivery/src/bark-pusher.ts`)
- Add source tag in title: `[SEC] 🔴 High-Quality Setup NVDA`

## Testing
- Test: event detail includes audit trail data
- Test: provenance section renders with source + filter path
- Test: confirmation shows "Also reported by" when count > 1
- Test: delivery templates include source info

## PR
- Branch: `feat/wp7-provenance`
- Title: "feat: provenance display with audit trail and source badges (WP7)"
- Create PR and STOP. Do not merge.
