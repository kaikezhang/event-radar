# AGENTS.md — Event Radar

> 所有 coding agent（Codex、Claude Code 等）的通用指令。Agent 专属指令见 CLAUDE.md。

## 项目概述

Real-time event-driven trading intelligence platform. Monitors 30+ sources (SEC filings, political social media, macro data), classifies events with AI, and pushes alerts to iOS/Telegram/Discord/Dashboard.

## Tech Stack

TypeScript monorepo (Turborepo). Backend: Fastify. Frontend: Next.js 15 + shadcn/ui + Tailwind. DB: PostgreSQL. Testing: Vitest + Playwright. SEC parsing: Python microservice (FastAPI + edgartools).

## 目录结构

```
packages/shared/      — types, interfaces, schemas (zod)
packages/backend/     — Fastify server, scanners, pipeline, delivery
packages/frontend/    — Next.js 15 dashboard
packages/sec-service/ — Python FastAPI microservice
packages/delivery/    — Alert delivery (Bark, Discord, Telegram, webhook)
packages/e2e/         — Playwright E2E tests
```

## Commands

```bash
turbo build          # build all packages
turbo test           # run all tests (Vitest)
turbo lint           # ESLint check
pnpm build           # same as turbo build
pnpm --filter @event-radar/backend lint   # lint backend only
pnpm --filter @event-radar/backend test   # test backend only
```

## Key Constraints

- **Zod** for all validation. `Result<T,E>` pattern for errors — don't throw.
- **Env vars** via `@t3-oss/env-core`. Never hardcode secrets.
- **One scanner per file.** Scanners only extract data — no classification logic.
- **Virtual list**: `@tanstack/virtual` (NOT AG Grid).
- **DB**: PostgreSQL via drizzle-orm (NOT SQLite).
- **Event bus**: EventEmitter now, Redis Streams later. Don't couple to implementation.
- **Tests**: Use mock data, no real DB/network calls. Vitest + `vi.fn()`.
- **Imports**: Use `.js` extension in imports (ESM). e.g. `import { foo } from './bar.js'`

## Git Workflow

- **完成任务后**: `git checkout -b feat/xxx` → commit → push → `gh pr create` → 等 owner merge
- **禁止直接 push 到 main**
- **严禁 merge PR！** 不要运行 `gh pr merge`、`git merge` 到 main。你只负责创建 PR 和修代码，merge 由 orchestrator 执行
- **Conventional Commits**: `feat(scanner): add SEC 8-K polling`, `fix(api): handle null ticker`
- **Branch naming**: `feat/`, `fix/`, `docs/`

## Verification（必须通过！）

完成代码后，**必须**运行以下命令并确保通过：

```bash
pnpm build && pnpm --filter @event-radar/backend lint
```

如果 lint 报错，修复后再 commit。如果 build 报错，修复后再 commit。

## 测试规范

- 每个新功能 ≥10 个 tests
- Tests 放在 `packages/backend/src/__tests__/` 目录
- 用 `vi.fn()` mock DB 和外部依赖
- 不要用 PGlite（除非测试需要真实 DB）
- 所有 tests 必须在 <10s 内完成

## 当前任务

读 `CLAUDE.md` 的 "Current Task" 部分获取详细任务说明。

读 `tasks.md` 获取整体开发计划和进度。

## Reference Docs

- `docs/ARCHITECTURE.md` — 系统设计、event bus、backpressure
- `docs/SOURCES.md` — 30+ 数据源
- `docs/FRONTEND.md` — dashboard UX spec
- `docs/DELIVERY.md` — 告警路由
- `docs/ROADMAP.md` — 开发路线图
