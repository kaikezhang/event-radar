# TASK.md — CrowdTest Round 2: Feed Noise + Trust + Accessibility

## ⚠️ DO NOT MERGE ANY PRs. Create PR and STOP.

## Overview
Fix top issues from 5-persona CrowdTest (7.0/10). Target: 8+/10.
Create ONE PR with all changes.

## 1. Fix Feed noise — StockTwits filtering (CRITICAL)
The #1 issue across all personas: 90%+ of feed events are StockTwits "entered trending" at MEDIUM severity.

### Backend fix:
- File: `packages/backend/src/scanners/stocktwits-scanner.ts`
- StockTwits "entered trending" events should be classified as LOW severity (not MEDIUM)
- Only upgrade to MEDIUM/HIGH if the ticker has unusual volume or multiple sources confirm
- Add a config flag `STOCKTWITS_TRENDING_DEFAULT_SEVERITY=LOW` in the scanner

### Frontend fix — Smart Feed improvement:
- File: `packages/web/src/pages/Feed/index.tsx` or wherever Smart Feed logic is
- Smart Feed should deprioritize LOW severity events — show them at the bottom, after HIGH/CRITICAL
- Add a feed quality indicator: show count of HIGH+ events vs total

## 2. Fix placeholder email on About page
- File: `packages/web/src/pages/About.tsx`
- Replace `[placeholder email]` with `hello@eventradar.app`
- This is a one-line fix but trust-destroying if left as-is

## 3. Fix font sizes for accessibility
- File: `packages/web/src/components/BottomNav.tsx`
  - Change `text-[10px]` to `text-xs` (12px) for bottom nav labels
- Check all other places with font sizes below 12px and bump them up:
  - Card metadata text should be at least 12px
  - Scorecard labels should be at least 12px  
  - Footer text should be at least 12px
- Search across `packages/web/src/` for `text-[10px]` and `text-[11px]` and fix all occurrences

## 4. Mobile-friendly tooltips
- Files: `packages/web/src/components/SeverityBadge.tsx`, `packages/web/src/components/DirectionBadge.tsx`
- Current: uses native `title` attribute which doesn't work on touch devices
- Fix: Replace with a click/tap-to-show tooltip component
- Implementation: 
  - On click/tap, show a small popover with the tooltip text
  - Click outside or tap again to dismiss
  - Keep the `title` attribute too for desktop hover
  - Use a simple absolute-positioned div, no need for a tooltip library
  - Also apply to any other components using `title` for jargon explanations (check Scorecard.tsx metric labels)

## 5. Add History page to navigation
- File: `packages/web/src/components/BottomNav.tsx`
- History page exists at `/history` but has no navigation link
- Options (pick the best UX):
  - Add "History" as 6th bottom nav item (if space allows), OR
  - Replace one of the less-used nav items, OR  
  - Add a "History" link in the Feed page header area
- Use the Clock icon from lucide-react

## 6. Improve tertiary text contrast
- Search for color `#71717a` (zinc-500) used on small text
- Replace with `#a1a1aa` (zinc-400) for better contrast on dark backgrounds
- Check: `packages/web/src/` CSS/tailwind classes using `text-zinc-500` on dark theme
- This affects WCAG AA compliance for small text

## Testing Requirements
- `pnpm --filter @event-radar/web test` — all tests must pass
- `pnpm --filter @event-radar/backend test` — all tests must pass
- `pnpm --filter @event-radar/web build` — must succeed
- Update any affected test snapshots

## PR
- Branch: `feat/phase4-crowdtest-round2`
- Title: `feat: CrowdTest round 2 — feed noise, accessibility, tooltips, navigation`
- **DO NOT MERGE. Create PR and stop.**
