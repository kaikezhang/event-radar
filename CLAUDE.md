# Event Radar

Real-time event-driven trading intelligence platform. Monitors 30+ sources (SEC filings, political social media, macro data), classifies events with AI, and pushes alerts to iOS/Telegram/Discord/Dashboard.

## Tech Stack

TypeScript monorepo (Turborepo). Backend: Fastify. Frontend: Next.js 15 + shadcn/ui + Tailwind. DB: PostgreSQL. Testing: Vitest + Playwright. SEC parsing: Python microservice (FastAPI + edgartools).

## Structure

```
packages/shared/     — types, interfaces, schemas (zod)
packages/backend/    — Fastify server, scanners, pipeline, delivery
packages/frontend/   — Next.js 15 dashboard
packages/sec-service/— Python FastAPI microservice
```

## Commands

- `turbo build` — build all packages
- `turbo test` — run all tests (Vitest)
- `turbo lint` — ESLint check
- `docker compose up` — start all services locally

## Git Workflow

- 完成任务后：创建新分支 → commit → push → 创建 PR → 由 master/owner merge 到 main
- 禁止直接 push 到 main
- **严禁 merge PR！** 你只负责创建 PR 和修改代码，merge 由晚晚（orchestrator）执行
- 不要运行 `gh pr merge`、`git merge` 到 main、或任何合并操作
- 修改 md/docs 可直接 commit 到 main

## Key Constraints

- Use zod for all validation. Result<T,E> pattern for errors, don't throw.
- Env vars via `@t3-oss/env-core`. Never hardcode secrets.
- One scanner per file. Scanners only extract data — no classification logic.
- Virtual list: @tanstack/virtual (NOT AG Grid). DB: PostgreSQL (NOT SQLite).
- Event bus interface: EventEmitter now, Redis Streams later. Don't couple to implementation.

## Verification

After any change: `turbo build && turbo test && turbo lint` must all pass.

## Tasks

Read `tasks.md` for current task and development plan.


## Current Task

See `TASK.md` for the current task specification. Do NOT read old task specs from this file.

**Your role depends on how you were invoked:**
- If told to "implement" or "develop" → implement the spec in TASK.md, create PR, DO NOT merge
- If told to "review" → only review code, post findings, then exit immediately. DO NOT fix code, DO NOT merge, DO NOT continue working after posting review.
- If told to "fix" → fix the specified issues, commit, push. DO NOT merge.

**In ALL cases: NEVER run `gh pr merge`. NEVER merge PRs. NEVER.**
