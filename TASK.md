# TASK.md — D8: Mobile Swipe Gestures & Polish

> Reference: `docs/plans/2026-03-17-alert-feed-redesign.md` (Section A — Interaction Design + D8)

## Goal
Add touch swipe gestures to feed cards on mobile for quick actions (dismiss / watchlist), and polish mobile-specific UI details.

## What to Build

### 1. Swipeable Alert Card Wrapper

**File:** `packages/web/src/components/SwipeableCard.tsx` (new)

A wrapper component that adds horizontal swipe gestures to AlertCard on touch devices:

**Swipe Left → Dismiss (mark as read):**
- Reveals a red/orange background with "Dismiss" text + icon
- On release past threshold (40% of card width): dismiss the card with slide-out animation
- Under threshold: spring back
- Dismissed cards get a muted/faded style or are removed from the list

**Swipe Right → Add to Watchlist:**
- Reveals a green background with "★ Watchlist" text + icon
- On release past threshold: add primary ticker to watchlist, show brief success toast
- If already on watchlist: show "Already saved" and spring back
- Under threshold: spring back

**Implementation approach:**
- Use touch event handlers (`onTouchStart`, `onTouchMove`, `onTouchEnd`)
- Track horizontal delta, apply `transform: translateX()` during swipe
- Use `transition` for spring-back animation
- Threshold: 40% of card width for action trigger
- Only enable on touch devices (check `'ontouchstart' in window` or use pointer events)
- Do NOT use a heavy library — keep it lightweight with native touch events

```tsx
interface SwipeableCardProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;    // dismiss
  onSwipeRight?: () => void;   // watchlist
  leftLabel?: string;          // "Dismiss"
  rightLabel?: string;         // "★ Watchlist"
  disabled?: boolean;          // disable on desktop
}
```

### 2. Integrate into Feed

**File:** `packages/web/src/pages/Feed.tsx`

Wrap each `<AlertCard>` with `<SwipeableCard>` on mobile:

```tsx
const isMobile = !isDesktop;  // from useMediaQuery

{alerts.map(alert => (
  isMobile ? (
    <SwipeableCard
      key={alert.id}
      onSwipeLeft={() => handleDismiss(alert.id)}
      onSwipeRight={() => handleQuickWatchlist(alert)}
    >
      <AlertCard alert={alert} ... />
    </SwipeableCard>
  ) : (
    <AlertCard key={alert.id} alert={alert} ... />
  )
))}
```

**Dismiss handler:** For now, just hide the card from the current view (filter it from the displayed list via local state). No backend endpoint needed yet.

**Watchlist handler:** Call `add(primaryTicker)` from useWatchlist hook. Show a brief inline notification "Added NVDA to watchlist ✓" that auto-dismisses after 2 seconds.

### 3. Toast Notification Component

**File:** `packages/web/src/components/Toast.tsx` (new)

A simple auto-dismissing notification:

```tsx
interface ToastProps {
  message: string;
  visible: boolean;
  onDismiss: () => void;
  duration?: number;  // default 2000ms
}
```

- Fixed at bottom center of screen, above the bottom nav
- Slides up on appear, slides down on dismiss
- Dark background with white text
- Auto-dismisses after `duration` ms

### 4. Mobile Polish

#### Bottom safe area
- Ensure feed cards and bottom nav respect `safe-area-inset-bottom` on notched phones
- Add `pb-safe` or `pb-[env(safe-area-inset-bottom)]` where needed

#### Touch targets
- All interactive elements must be at least 44px touch target
- Check: filter chips, sort dropdown, tab buttons, watchlist stars

#### Card press feedback
- Add `active:scale-[0.98]` to AlertCard for subtle press feedback on mobile
- Already has `active:bg-bg-elevated` — keep that too

#### Scroll performance
- Add `will-change: transform` to swipeable cards during active swipe
- Remove it after swipe ends (avoid permanent GPU layer)

### 5. Haptic Feedback (optional, best-effort)

If the browser supports it, trigger a subtle vibration on swipe action:
```tsx
if ('vibrate' in navigator) {
  navigator.vibrate(10);  // 10ms micro-vibration
}
```

Only on successful swipe action (past threshold), not during drag.

### Testing
- Build: `pnpm --filter @event-radar/web build` must pass
- Visual: swipe left reveals dismiss action on mobile
- Visual: swipe right reveals watchlist action on mobile
- Visual: toast notification appears and auto-dismisses
- Functional: dismiss removes card from view
- Functional: watchlist add works via swipe
- Functional: desktop cards are NOT swipeable (no wrapper)
- Visual: active press scale effect on mobile cards

## Do NOT Change
- Do NOT modify AlertCard internal layout (done in D1+D2)
- Do NOT modify EventDetail (done in D3+D4)
- Do NOT modify desktop split-panel behavior (done in D7)
- Do NOT add backend endpoints for dismiss (local state only for now)

## PR
- Branch: `feat/d8-mobile-swipe-polish`
- Title: "feat: mobile swipe gestures & polish (D8)"
- CREATE PR AND STOP. DO NOT MERGE.
