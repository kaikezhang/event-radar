# tasks.md — Event Radar 开发任务

> 晚晚指挥 Claude Code 的任务清单。每次启动 CC 前更新 "当前任务"。

---

## 当前任务
**Phase 1A.4 — Observability（Prometheus + Grafana）**

目标：为 Event Radar 添加监控和可观测性。

具体要求：
1. 在 backend 添加 Prometheus metrics endpoint (`/metrics`)
2. 关键指标：
   - scanner_events_total（按 scanner 和 event type 分）
   - events_classified_total（按 severity 分）
   - delivery_attempts_total（按 delivery type 和 status 分）
   - processing_duration_seconds（histogram）
3. 添加 Grafana dashboard JSON（可选）

完成标准：`turbo build && turbo test && turbo lint` 全绿。
   - 添加 Form 4 相关的默认规则
   - insider purchase > $1M → CRITICAL
   - insider purchase > $100k → HIGH  
   - insider sale → MEDIUM
   - routine/10b5-1 plan sale → LOW

3. 测试：
   - Mock Form 4 XML 解析
   - 新规则的分类测试

完成标准：`turbo build && turbo test && turbo lint` 全绿，pytest 通过。

---

## 任务队列（按顺序执行）

### Phase 0

- [x] **P0.1** 项目 scaffold ✅
- [x] **P0.2** Scanner 插件框架 ✅
- [x] **P0.3** SEC EDGAR 8-K scanner（Python FastAPI 微服务 + edgartools）✅
- [x] **P0.4** Delivery: Bark + Discord ✅
- [~] **P0.5** 测试基础 — 已有 91 tests，跳过，按需补充

### Phase 1A

- [x] **P1A.1** PostgreSQL schema + query API ✅
- [x] **P1A.2** 规则引擎分类 ✅
- [x] **P1A.3** Form 4 Scanner ✅ (turbo build/test/lint 通过)
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
