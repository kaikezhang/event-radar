# TASK: Source-Specific Web App Cards

## Role
You are implementing source-specific card rendering in the web app Feed and EventDetail pages. This mirrors what we just did for Discord webhook templates (PR #151).

## Goal
Make Feed AlertCards and EventDetail pages render **source-specific information** based on the event source. Each source type should show relevant metadata in a visually distinct way.

## Architecture

### Backend Changes (minimal)

The feed API (`GET /api/v1/feed`) currently does NOT return `metadata` or `sourceKey` to the frontend. We need to add a lightweight `sourceMetadata` field to the feed response that extracts source-specific fields.

In `packages/backend/src/routes/dashboard.ts`, in the feed endpoint's `.map()`, add:

```typescript
sourceMetadata: extractSourceMetadata(row.source, metadata),
```

Create a helper `extractSourceMetadata(source: string, metadata: Record<string, unknown>)` that returns a small subset of relevant metadata per source:

- **breaking-news**: `{ url, headline, sourceFeed }`
- **sec-edgar**: `{ formType, companyName, filingLink, itemDescriptions }`
- **trading-halt**: `{ haltReasonCode, haltReasonDescription, haltTime, resumeTime, market, isResume }` (isResume = event type is 'resume')
- **econ-calendar**: `{ indicatorName, scheduledTime, frequency, tags }`
- **stocktwits**: `{ currentVolume, previousVolume, ratio }`
- **reddit**: `{ upvotes, comments, highEngagement }`

Use the REAL scanner metadata keys (we verified these in PR #151).

### Frontend Changes

#### 1. Update Types (`packages/web/src/types/index.ts`)

Add `sourceMetadata?: Record<string, unknown>` to `AlertSummary`.

#### 2. Update AlertCard (`packages/web/src/components/AlertCard.tsx`)

Below the summary line (Row 3), add a **source-specific detail strip** that shows 1-2 lines of key metadata. Keep it compact — this is a card, not a detail page.

**Breaking News:**
- Show source feed name if available (e.g., "via CNBC")
- Nothing else — the summary + direction are enough

**SEC Filing:**
- Show form type badge (e.g., "8-K" / "13F" / "Form 4") as a small pill
- Show item descriptions if 8-K (e.g., "Item 5.02 — Departure of Directors")
- Link to filing if available

**Trading Halt:**
- Show halt reason + code (e.g., "T1 — News Pending")
- Show halt/resume time
- If resume event, show "✅ RESUMED at 11:15 AM ET" instead of halt styling

**Econ Calendar:**
- Show indicator name
- Show frequency tag (e.g., "Monthly")

**Social (StockTwits/Reddit):**
- StockTwits: Show volume ratio (e.g., "3.2x normal volume")
- Reddit: Show engagement stats (e.g., "↑ 1.2k · 💬 340")

#### 3. Update EventDetail (`packages/web/src/pages/EventDetail.tsx`)

The EventDetail page already receives full `metadata` from the backend. Add a **Source Details** section between the AI Analysis and Historical sections that shows source-specific structured data.

Use the same source routing logic but with more detail than the card view.

For EventDetail, read metadata directly from `event.metadata` (it's already returned by `GET /api/events/:id`).

### Design Guidelines

- Use the existing design system colors and spacing
- Source-specific strips should be subtle — use `text-text-secondary` and `text-[12px]` for metadata
- Add small source-type icons or emoji if it helps readability
- Halt cards should visually distinguish halt vs resume (red accent for halt, green for resume)
- Filing links should be clickable `<a>` tags opening in new tab
- Keep mobile-friendly — everything should work on narrow screens

### Tests

- Add tests for `extractSourceMetadata` helper
- Update existing AlertCard tests if any
- No need for E2E tests — this is a rendering change

## DO NOT
- Do NOT change the Discord webhook code (that's already done in PR #151)
- Do NOT modify the delivery pipeline
- Do NOT restructure existing components — just add source-specific sections

## Output
- Create a PR with title: `feat: source-specific web app cards`
- Branch: `feat/source-specific-web-cards`
- Push and create PR. **DO NOT MERGE.**
