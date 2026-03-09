# CLAUDE.md — Event Radar

## 项目概述
Event Radar 是一个全栈、多源、实时事件驱动交易情报平台。监控 SEC 文件、政治人物社交媒体、宏观经济数据等 30+ 信源，AI 分类后推送到 iOS/Telegram/Discord/Dashboard。

## 技术栈（已定，不可更改）
- **Runtime**: Node.js + TypeScript (strict mode)
- **Backend**: Fastify
- **Frontend**: Next.js 15 (App Router) + shadcn/ui + Tailwind CSS
- **Database**: PostgreSQL (JSONB for event metadata)
- **Event Bus**: EventEmitter (Phase 0) → Redis Streams (Phase 1+)
- **Monorepo**: Turborepo
- **SEC Parsing**: Python microservice (FastAPI + edgartools)
- **Financial NLP**: FinBERT / SEC-BERT
- **Scraping**: Crawlee (Playwright-based)
- **Charts**: TradingView Lightweight Charts
- **Virtual List**: @tanstack/virtual (NOT AG Grid)
- **Layout**: react-grid-layout
- **State**: Zustand
- **Testing**: Vitest + Playwright (E2E)
- **Observability**: Prometheus + Grafana
- **Push**: Bark (iOS critical) + Telegram + Discord webhook

## 文件结构约定
```
packages/
  shared/          — Event schema, Scanner interface, types
  backend/         — Fastify server, pipeline, delivery
    src/
      scanners/    — 每个 scanner 一个文件
      pipeline/    — classification, dedup, correlation
      delivery/    — bark, telegram, discord, webhook
      api/         — REST API routes
  frontend/        — Next.js dashboard
  sec-service/     — Python FastAPI (edgartools + FinBERT)
docker-compose.yml
```

## 代码风格
- 用 zod 做所有 schema validation（输入输出都要）
- 错误处理用 Result<T, E> 模式，不要 throw（除非真的不可恢复）
- 每个 export 函数都要 JSDoc
- 用 `const` 优先，避免 `let`
- 异步函数都要有 timeout
- 所有环境变量通过 `@t3-oss/env-core` 类型安全加载

## 测试约定
- 用 Vitest
- 测试文件和源文件同目录：`scanner.ts` → `scanner.test.ts`
- Mock 所有外部 API（SEC、Bark、Discord），不要真打
- Scanner 测试用 fixture 数据（`__fixtures__/` 目录）
- 目标覆盖率：scanner + classification > 80%

## Scanner 插件约定
每个 scanner 必须实现 `Scanner` interface：
```typescript
interface Scanner {
  id: string;           // e.g. "sec-edgar-8k"
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  pollIntervalMs: number;
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): ScannerHealth;
}
```
- 每个 scanner 独立、crash-isolated
- 所有 scanner 通过 EventBus.publish() 发送事件
- 不要在 scanner 里做分类，只做数据抽取

## Event Schema（统一事件格式）
```typescript
interface RawEvent {
  id: string;            // UUID
  scannerId: string;
  tier: number;
  source: string;        // "sec-edgar", "truth-social", etc.
  detectedAt: Date;
  rawContent: string;
  tickers: string[];     // extracted ticker symbols
  url?: string;          // source URL
  metadata: Record<string, unknown>;  // source-specific data
}
```

## 关键架构决策
1. **Event Bus 接口化**：Phase 0 用 EventEmitter，Phase 1 换 Redis Streams，接口不变
2. **Python/TS 边界**：SEC parsing 走 HTTP/JSON 微服务，不要 child_process
3. **AI 分类两阶段**：规则引擎（免费、instant）→ LLM（付费、async）
4. **Backpressure**：Tier 1 优先级 > Tier 4，AI 并发限制 5，delivery 限流
5. **PostgreSQL 直接用**：不要 SQLite，Docker Compose 一个容器零额外复杂度

## 任务管理
- 当前任务和开发计划见 `tasks.md`
- 每次启动时先读 `tasks.md` 了解当前要做什么

## Git 开发规范

### 分支策略
- `main` — 始终可部署，所有 CI 必须通过
- `feat/<name>` — 功能分支，从 main 拉，完成后 PR 回 main
- `fix/<name>` — bug 修复
- `docs/<name>` — 纯文档修改
- **不要直接 push main**（除非是 trivial 的文档/配置改动）

### Commit 规范（Conventional Commits）
格式：`<type>(<scope>): <description>`

```
feat(scanner): add SEC 8-K polling
fix(delivery): handle Bark timeout retry
test(scanner): add Form 4 parser unit tests
refactor(pipeline): extract classification into separate module
docs(roadmap): update Phase 1 timeline
chore(deps): bump fastify to 5.x
ci: add PostgreSQL service to test workflow
```

类型：
- `feat` — 新功能
- `fix` — bug 修复
- `test` — 测试相关
- `refactor` — 重构（不改功能）
- `docs` — 文档
- `chore` — 构建/工具/依赖
- `ci` — CI/CD 配置
- `perf` — 性能优化

scope 用模块名：`scanner`, `delivery`, `pipeline`, `frontend`, `api`, `shared`, `docker`

### Commit 粒度
- **一个 commit = 一个逻辑改动**，不要把 3 个不相关的改动塞一个 commit
- 可以编译通过、测试通过的状态才 commit
- 写有意义的 commit message，未来能搜到

### PR 工作流
1. 从 main 创建功能分支：`git checkout -b feat/sec-scanner`
2. 开发 + commit（可以多次 commit）
3. push 分支：`git push -u origin feat/sec-scanner`
4. 创建 PR，标题用 Conventional Commits 格式
5. CI 通过 + review 后 merge
6. merge 用 **Squash and Merge**（保持 main 历史干净）
7. merge 后删除远程分支

### Git Worktree 并行开发
独立 scanner 可以并行开发：
```bash
git worktree add ../er-sec feat/sec-scanner
git worktree add ../er-bark feat/bark-delivery
# 各自独立开发，完成后 PR merge
```
- worktree 之间不要有代码依赖
- 共享的 types 修改要先 merge 到 main，其他 worktree 再 rebase

### .gitignore 规则
- `node_modules/`, `dist/`, `.env`, `.env.local`
- `*.log`, `coverage/`, `.turbo/`
- 不要提交 secrets、API keys、生成的文件
- Docker volumes 和数据库文件不提交

### Release & Tagging
- 用语义化版本：`v0.1.0`, `v0.2.0`, `v1.0.0`
- Phase 0 完成 = `v0.1.0`
- Phase 1 完成 = `v0.2.0`
- Dashboard MVP (Phase 2) = `v0.5.0`
- Production-ready = `v1.0.0`
- 每个 tag 附带 GitHub Release + changelog

## 不要做的事
- ❌ 不要引入 AG Grid
- ❌ 不要用 SQLite
- ❌ 不要在 scanner 里 throw error（return Result）
- ❌ 不要硬编码 API key（全部走环境变量）
- ❌ 不要一次实现多个 scanner（一次一个，测完再下一个）
