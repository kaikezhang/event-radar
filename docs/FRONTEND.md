# Frontend

## Architecture

Event Radar ships a single user-facing web application built with Vite + React 19:

### User-Facing App (`packages/web`)
Mobile-first PWA for traders and investors.

**Pages:**
- **Feed** — Live event stream with tabs (Watchlist/All), filters (severity/source/ticker/date), saved presets, swipeable cards
- **Event Detail** — Full enrichment display, historical analogs, inline chart, verdict/feedback, source-specific cards
- **Watchlist** — Drag-and-drop ticker management with sections
- **Ticker Profile** — Per-ticker event history and context
- **Scorecard** — Rolling accuracy by severity and source with confidence intervals
- **Search** — Full-text event search
- **Settings** — Timezone, quiet hours, daily push cap
- **Login/Onboarding** — Magic link auth + first-run setup

## Tech Stack

| Component | Library | Notes |
|-----------|---------|-------|
| Framework | React 19 | Latest, using new features |
| Build | Vite 6 | Fast builds, HMR |
| Routing | React Router 7 | Client-side routing |
| Data Fetching | TanStack Query | Caching, refetch, mutations |
| Styling | Tailwind CSS 4 | Utility-first |
| Charts | lightweight-charts | Candlestick + event markers |
| Analytics Charts | Recharts | Scorecards and visual summaries |
| Real-time | Native WebSocket | Live event updates |
| Notifications | Web Push API | Browser-native push |
| Testing | Vitest + Testing Library | Component + integration tests |

## Key Patterns

- **Mobile-first**: Tailwind responsive classes, touch gestures (swipeable cards)
- **Live updates**: WebSocket connection for real-time event streaming
- **Source-specific cards**: Each data source (SEC, Reddit, news) has a tailored display template
- **Trust cues**: Scorecard data displayed inline to show source reliability
- **Filter presets**: Users save and recall filter configurations
- **PWA**: Installable, push notifications, offline cached history

## Development

```bash
# User app (port 5173, proxies /api → localhost:3001)
pnpm --filter @event-radar/web dev

# Build
pnpm build

# Test
pnpm --filter @event-radar/web test
```
