# tasks.md — Event Radar 开发任务

> 晚晚指挥 Claude Code 的任务清单。每次启动 CC 前更新 "当前任务"。

---

## 当前任务
**Phase 0.2 — Scanner 插件框架**

目标：实现 Scanner base class、scanner registry、in-memory EventBus，让后续 scanner 开发只需要继承 base class。

具体要求：
1. 在 `packages/shared/src/` 中实现：
   - `BaseScanner` abstract class — 实现 Scanner interface，提供：
     - polling loop（start/stop 控制，interval 可配）
     - health tracking（lastPollAt, errorCount, status）
     - 错误处理（单次 poll 失败不崩溃，记录 error，继续下次）
     - abstract `poll()` 方法，子类只需实现这个
   - `InMemoryEventBus` — 实现 EventBus interface，用 Node.js EventEmitter
     - publish(event) / subscribe(handler) / unsubscribe(handler)
     - 事件计数 metrics（published count, handler count）
   - `ScannerRegistry` — 管理所有 scanner 实例
     - register(scanner) / unregister(id)
     - startAll() / stopAll()
     - healthAll() — 返回所有 scanner 的 health 状态
     - getById(id)
2. 在 `packages/backend/src/` 中：
   - 创建一个 `DummyScanner`（用于测试）— 每次 poll 生成一个假事件
   - 在 Fastify server 启动时注册 DummyScanner，启动 polling
   - 添加 `GET /health` endpoint — 返回所有 scanner health 状态
3. 测试：
   - BaseScanner 测试：start/stop lifecycle、error handling、health tracking
   - InMemoryEventBus 测试：publish/subscribe、多 handler、unsubscribe
   - ScannerRegistry 测试：register/unregister、startAll/stopAll、healthAll
   - 目标覆盖率 >80%

完成标准：`turbo build && turbo test && turbo lint` 全绿，DummyScanner 能跑起来生成事件。

---

## 任务队列（按顺序执行）

### Phase 0

- [x] **P0.1** 项目 scaffold ✅
- [x] **P0.2** Scanner 插件框架 ✅
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
