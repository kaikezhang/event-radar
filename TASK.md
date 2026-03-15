# TASK.md — WP9: Landing Page

> Reference: `docs/plans/2026-03-15-phase3-productization-v2.md` (WP9)

## Goal
A single-page marketing site that communicates Event Radar's value to swing traders.

## Key Principles (from CEO review)
- Do NOT mention pricing
- Do NOT say "AI-powered"
- Do NOT compare to Bloomberg
- Let the scorecard and example alert speak for themselves

## Structure — Create `packages/landing/index.html`

Static HTML + Tailwind CDN (no React, no build step).

### Sections:
1. **Hero**: "Not more alerts. Better setups." + styled example alert
2. **Problem**: "You get 200 alerts a day. You act on 3. We show you the 3."
3. **How It Works**: 4 cards — What happened / Why now / What followed / Whether we were right
4. **Scorecard**: "We Show Our Receipts" — mock 90-day accuracy table (biggest section)
5. **Self-Host**: `docker compose up -d` prominent + GitHub link
6. **Waitlist**: "Cloud beta — limited spots" + email input

### Design:
- Dark theme: `bg-[#07111f]` matching the app
- Tailwind CDN: `<script src="https://cdn.tailwindcss.com"></script>`
- Mobile-responsive
- Professional, minimal

## PR
- Branch: `feat/wp9-landing` (already created)
- Title: "feat: landing page — not more alerts, better setups (WP9)"
- Create PR and STOP.
