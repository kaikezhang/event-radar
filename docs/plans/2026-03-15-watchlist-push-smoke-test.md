# Watchlist to Push Smoke-Test Notes

## Flow reviewed

1. Open the web app and land on the watchlist-first onboarding state.
2. Add a first ticker and look for the next-step push CTA.
3. Open settings from that CTA and verify the push enable path is obvious.
4. Follow the notification landing path into event detail and check recovery navigation.

## Friction points fixed

- Watchlist push CTAs now deep-link into the push section of settings instead of dropping users onto a generic settings view.
- Push wording is aligned around "push alerts" so the watchlist CTA and settings actions match.
- Settings now puts push setup ahead of sound preferences, adds a short activation checklist, and links back to the watchlist/feed.
- Direct event-detail landings now offer a safe "Back to watchlist" path instead of relying on browser history.

## Deferred

- No broader onboarding redesign.
- No backend push-delivery changes.
- No event-detail content rewrite beyond the direct-landing navigation fix.
