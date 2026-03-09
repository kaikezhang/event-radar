# tasks.md — Event Radar 开发任务

> 晚晚指挥 Claude Code 的任务清单。每次启动 CC 前更新 "当前任务"。

---

## 当前任务
**Phase 1A.1 — PostgreSQL Schema + Query API**

目标：添加 PostgreSQL 持久化层，存储所有 RawEvent，提供查询 API。

具体要求：
1. 在 `packages/shared/` 中：
   - 添加 drizzle-orm + drizzle-kit 依赖
   - 定义 `events` 表 schema（id, source, sourceEventId, title, summary, rawPayload, metadata, severity, receivedAt, createdAt）
   - 定义 `deliveries` 表 schema（id, eventId, channel, status, error, sentAt）
   - 导出 db schema 和类型

2. 在 `packages/backend/` 中：
   - 添加 PostgreSQL 连接（pg driver + drizzle）
   - EventBus handler 存储 event 到数据库
   - 添加 REST API endpoints：
     - `GET /api/events` — 分页列表，支持 ?source=&severity=&limit=&offset= 筛选
     - `GET /api/events/:id` — 单个事件详情
     - `GET /api/stats` — 事件统计（按 source、severity 分组计数）
   - 配置：DATABASE_URL 环境变量

3. Docker：
   - 在 `docker-compose.yml` 添加 PostgreSQL 服务
   - 添加 db migration 脚本（drizzle-kit generate + migrate）

4. 测试：
   - 用 SQLite (drizzle 支持) 做内存测试，不依赖真实 PG
   - 测试 event 存储、查询、分页、筛选

完成标准：`turbo build && turbo test && turbo lint` 全绿，事件能持久化到 PG。

---

## 任务队列（按顺序执行）

### Phase 0

- [x] **P0.1** 项目 scaffold ✅
- [x] **P0.2** Scanner 插件框架 ✅
- [x] **P0.3** SEC EDGAR 8-K scanner（Python FastAPI 微服务 + edgartools）✅
- [x] **P0.4** Delivery: Bark + Discord ✅
- [~] **P0.5** 测试基础 — 已有 91 tests，跳过，按需补充

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
