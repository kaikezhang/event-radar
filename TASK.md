# TASK.md — DQ-4: Outcome Tracking + Scorecard Improvement

## ⚠️ DO NOT MERGE ANY PRs. Create PR and STOP.

## Overview
We have 12,016 outcome records with 6,346 having T+5 price data, but Scorecard shows only ~91 "usable verdicts". Fix the verdict calculation and reframe the Scorecard to build trust.

## 1. Investigate and fix low verdict count
- File: `packages/backend/src/services/scorecard-aggregation.ts`
- We have 6,346 events with T+5 price changes but only ~91 "usable verdicts"
- The direction verdict requires `predictedDirection` which is now always NEUTRAL (we just removed direction prediction in DQ-3)
- Fix: Change the "usable verdict" definition:
  - A verdict is usable when `changeT5 IS NOT NULL` (we have a price outcome)
  - Don't require direction correctness for the top-level count
  - "Setup worked" = abs(changeT5) >= 5% (significant move happened regardless of direction)
  - Show "X events with price outcomes" instead of "X verdicts"

## 2. Reframe Scorecard to lead with strengths
- File: `packages/web/src/pages/Scorecard.tsx`
- Current: leads with "36% directional hit rate" which sounds terrible
- New framing:
  - **Top section**: "Events Tracked: 23,769 | Sources Monitored: 13 | Events with Price Data: 6,346"
  - **Second section**: Source accuracy — which sources lead to biggest price moves? (already partially built)
  - **Third section**: "Setup Worked Rate" — what % of events led to 5%+ moves
  - **Remove or de-emphasize**: directional hit rate (since we removed direction prediction)
  - Keep the existing bucket breakdowns (source, event type, confidence)

## 3. Add "Calibration disclaimer" at top of Scorecard
- File: `packages/web/src/pages/Scorecard.tsx`
- Add a banner at the top:
  - "📊 Scorecard tracks how market events correlate with price movements. This is a calibration tool, not a prediction score."
  - "Price data from T+5 (5 trading days after event). Coverage: X% of events."
  - Style: subtle info banner, not alarming

## 4. Fix Scorecard API to use new verdict definition
- File: `packages/backend/src/services/scorecard-aggregation.ts`
- Update the aggregate query to:
  - Count all events with changeT5 as "trackable"
  - "Setup worked" = abs(changeT5) >= 5.0 (significant price move)
  - Remove or set to 0 the "directional correct" count (direction is now always NEUTRAL)
  - Ensure the API returns meaningful numbers with the new calculation

## 5. Show outcome coverage percentage
- File: `packages/web/src/pages/Scorecard.tsx`  
- Instead of "91 verdicts / 23,769 alerts (0.4%)" show:
  - "6,346 events with price outcomes / 12,028 events with tickers (52.8%)"
  - This is a much more honest and better-looking number
  - Add note: "Events without tickers (macro events, government actions) don't have individual price tracking"

## Testing
- `pnpm --filter @event-radar/backend test` — all tests must pass
- `pnpm --filter @event-radar/web test` — all tests must pass
- `pnpm --filter @event-radar/web build` — must succeed

## PR
- Branch: `feat/dq4-outcome-scorecard`
- Title: `feat: DQ-4 outcome tracking + scorecard reframe`
- **DO NOT MERGE. Create PR and stop.**
