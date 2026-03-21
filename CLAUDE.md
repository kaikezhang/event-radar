# CLAUDE.md — Event Radar

## ⛔ CRITICAL: NEVER MERGE PRs! NEVER PUSH TO MAIN!
Create your PR and STOP. Do not run `gh pr merge`. Do not run `git push origin main`. Only 晚晚 (the orchestrator) merges PRs. Violating this rule wastes everyone's time.

## Project
Real-time stock market event detection + AI-powered historical analysis platform. Monorepo with pnpm workspaces.

## Structure
- `packages/backend/` — Fastify API + scanners + pipeline
- `packages/delivery/` — Discord webhook, Bark push, Telegram, generic webhook
- `packages/shared/` — Types, schemas, base classes
- `services/sec-scanner/` — Python SEC EDGAR scanner

## Commands
- `pnpm --filter @event-radar/backend build` — Build backend
- `pnpm --filter @event-radar/backend test` — Run tests  
- `pnpm --filter @event-radar/backend dev` — Dev server (port 3001)
- `pnpm --filter @event-radar/backend lint` — Lint

## Rules
- TypeScript strict mode
- ESM with .js extensions in imports
- Use existing patterns (BaseScanner, EventBus, RuleEngine)
- All new files need tests
- **NEVER push directly to main!** Always create a feature branch and PR
- Do NOT merge PRs — create PR and stop. Only 晚晚 merges.
- Run `pnpm --filter @event-radar/backend test` before creating PR — all tests must pass
- DB: PostgreSQL with Drizzle ORM (see `packages/backend/src/db/schema.ts`)
- DB URL: `postgresql://radar:radar@localhost:5432/event_radar`

## Git Workflow (MANDATORY)
1. Create a feature branch from main: `git checkout -b feat/your-feature main`
2. Make your changes, commit
3. Push the feature branch: `git push origin feat/your-feature`
4. Create a PR: `gh pr create --title "..." --body "..."`
5. **STOP.** Do not merge. Do not push to main directly. Ever.

## Current Task

**Read `TASK.md` for the full task specification.** Do not proceed without reading it first.
