# UI/UX Review Brief — Event Radar Web App

> Date: 2026-03-15 | Requested by: CEO | Target: Mobile-first PWA redesign

## Current Screenshots
All in this directory (`docs/ux-review/`):
- `01-feed-default.jpg` — Feed page (All Events, unauthenticated)
- `02-event-detail.jpg` — Event detail page
- `03-scorecard.png` — Scorecard page
- `04-watchlist.png` — Watchlist page (with onboarding)
- `05-settings.png` — Settings page
- `06-login.png` — Login page
- `07-onboarding.png` — Onboarding flow
- `08-feed-watchlist-tab.png` — Feed with My Watchlist tab selected (empty state)
- `09-landing-page.jpg` — Landing page

## CEO Feedback (Direct Quotes)

### Feed Page Issues
1. **"没注册的用户点开这个网页，一看到feed界面就应该有一些历史feed"** — Unauthenticated users should see real historical events immediately so they know what the product looks like
2. **"按日期进行section"** — Events should be grouped by date sections ("Today", "Yesterday", "March 13", etc.)
3. **"界面有两个重复的Event Radar text"** — Header has "Event Radar" logo AND a "Feed" link, plus the hero section has another "⚡ Event Radar" heading — redundant
4. **"中间那个section完全没必要"** — The hero card with "⚡ Event Radar / AI-powered market intelligence / Connected status" takes up valuable space above the fold
5. **"应该可以用向下拖动来刷新"** — Pull-to-refresh on mobile
6. **"connected status标识在headbar就可以了"** — WebSocket connection status should be a small indicator in the header bar, not a prominent element

### Overall Design Issues
7. **"颜色也不好看"** — Current color scheme needs improvement
8. **"要简洁美观"** — Cleaner, more minimal design
9. **"mobile first"** — Must be designed mobile-first (current design feels desktop-adapted-to-mobile)

## Review Requirements

You are reviewing as both **CEO** and **UX/UI Designer**.

### Part 1: CEO Review
- Is each page serving the right purpose for a swing trader?
- What's the first impression for a new user who lands on the feed (unauthenticated)?
- Is the information hierarchy correct?
- What features are missing or misplaced?

### Part 2: UX/UI Design Review (use web-design-guidelines skill)
- **Mobile-first**: Design for 375px-428px primary viewport
- **Visual hierarchy**: What should the user see first?
- **Color palette**: Propose a new palette (dark theme, trading-terminal aesthetic but modern/clean)
- **Typography**: Is the current type scale working?
- **Spacing & density**: Too dense? Too sparse? For a trading app, density is expected but not at the cost of readability
- **Component design**: Cards, badges, tabs, nav — what needs redesign?
- **Interaction patterns**: Pull-to-refresh, tab switching, scroll behavior
- **Empty states**: Current empty states are text-only, could be more engaging

### Part 3: Concrete Redesign Spec
For each page, provide:
1. What to remove
2. What to move/reorganize
3. What to add
4. New component specifications (colors, spacing, type)
5. Mockup description or wireframe if possible

### Pages to Review
1. Feed (most critical — first thing users see)
2. Event Detail
3. Scorecard
4. Watchlist
5. Settings
6. Login
7. Onboarding
8. Bottom Navigation

## Tech Constraints
- React 19 + Tailwind CSS 4
- Current component library: Lucide icons
- No external UI library (no shadcn, no MUI)
- Dark theme only
- Must work as PWA (install to home screen)

## Deliverable
Write the complete review + redesign spec to `docs/ux-review/2026-03-15-ux-redesign.md`.
