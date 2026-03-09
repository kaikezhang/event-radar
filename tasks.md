# tasks.md — Event Radar 开发任务

> 晚晚指挥 Claude Code 的任务清单。每次启动 CC 前更新 "当前任务"。

---

## 当前任务
**Phase 0.1 — 项目 scaffold**

目标：搭建 Turborepo monorepo 骨架，所有包能 build + lint + test。

具体要求：
1. 初始化 Turborepo monorepo
2. 创建 3 个 packages：
   - `packages/shared` — 共享 types（Event schema, Scanner interface, Result type）
   - `packages/backend` — Fastify server（空壳，能启动即可）
   - `packages/frontend` — Next.js 15 App Router（空壳，能启动即可）
3. 配置：
   - TypeScript strict mode（所有 packages 共享 tsconfig.base.json）
   - ESLint + Prettier
   - Vitest（shared + backend）
   - Docker Compose（app + PostgreSQL）
   - GitHub Actions CI（lint + test + build）
4. shared package 里定义：
   - `RawEvent` interface
   - `Scanner` interface
   - `ScannerHealth` type
   - `Result<T, E>` type
   - `EventBus` interface
5. 写一个 smoke test 验证 shared types 能被 backend import

完成标准：`turbo build` + `turbo test` + `turbo lint` 全绿。

---

## 任务队列（按顺序执行）

### Phase 0

- [ ] **P0.1** 项目 scaffold ← 当前
- [ ] **P0.2** Scanner 插件框架（base Scanner class, registry, in-memory EventBus）
- [ ] **P0.3** SEC EDGAR 8-K scanner（Python FastAPI 微服务 + edgartools）
- [ ] **P0.4** Delivery: Bark + Discord（end-to-end proof: SEC 8-K → Bark push <60s）
- [ ] **P0.5** 测试基础（unit tests, mock SEC data, >80% coverage on scanner + classify）

### Phase 1A

- [ ] **P1A.1** PostgreSQL schema + query API
- [ ] **P1A.2** 规则引擎分类（Stage 1: keyword matching, 8-K item mapping）
- [ ] **P1A.3** 更多 Tier 1 scanner（Form 4, Fed, BLS）
- [ ] **P1A.4** Observability（Prometheus + Grafana）
- [ ] **P1A.5** 集成测试

### Phase 1B

- [ ] **P1B.1** LLM 分类引擎（Stage 2: Claude/GPT + FinBERT）
- [ ] **P1B.2** Tier 2 scanner（Trump Truth Social, Elon X）
- [ ] **P1B.3** 事件去重
- [ ] **P1B.4** Delivery: Telegram + webhook

### Phase 1C

- [ ] **P1C.1** Tier 3 scanner（PR Newswire, BusinessWire, GlobeNewswire）
- [ ] **P1C.2** 分类调优 + confidence UX
- [ ] **P1C.3** REST API v1

### Phase 2

- [ ] **P2.1** Frontend scaffold（Next.js + shadcn/ui + dark theme）
- [ ] **P2.2** Live Event Feed（WebSocket + virtual list）
- [ ] **P2.3** Event Detail panel
- [ ] **P2.4** Chart panel（TradingView Lightweight Charts）
- [ ] **P2.5** System Health bar + Auth
- [ ] **P2.6** Deployment + E2E tests

---

## 已完成

- [x] 项目文档（README, VISION, SOURCES, ARCHITECTURE, FRONTEND, DELIVERY, REFERENCES, ROADMAP）
- [x] Claude Code review → REVIEW.md
- [x] 根据 review 修改所有文档
- [x] GitHub repo 创建 + push

---

## 开发规则

1. **一次一个任务** — 完成当前任务后，晚晚更新 "当前任务" 再启动下一个 CC session
2. **每个任务结束后** — review + commit + push，然后更新此文件
3. **测试优先** — 每个功能都要有对应测试
4. **不要跳步** — 按队列顺序执行，除非晚晚明确跳过
