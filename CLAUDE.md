# CLAUDE.md — Event Radar

## Project
Real-time stock market event detection system. Monorepo with pnpm workspaces.

## Structure
- `packages/backend/` — Fastify API + scanners + pipeline
- `packages/delivery/` — Discord webhook, Bark push, Telegram, generic webhook
- `packages/shared/` — Types, schemas, base classes
- `packages/e2e/` — (TO DELETE — frontend removed)

## Commands
- `pnpm --filter @event-radar/backend build` — Build backend
- `pnpm --filter @event-radar/backend test` — Run tests  
- `pnpm --filter @event-radar/backend dev` — Dev server (port 3001)

## Rules
- TypeScript strict mode
- Use existing patterns (BaseScanner, EventBus, RuleEngine)
- All new files need tests
- Do NOT merge PRs — create PR and stop
- Do NOT modify docker-compose.yml or Dockerfile
- Keep imports consistent with existing codebase (ESM with .js extensions)
- Run `pnpm --filter @event-radar/backend test` before creating PR — all tests must pass
