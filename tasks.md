# tasks.md — Event Radar 开发任务

> 晚晚指挥 Claude Code 的任务清单。每次启动 CC 前更新 "当前任务"。

---

## 当前任务
**Phase 0.4 — Delivery: Bark + Discord（end-to-end proof: SEC 8-K → Bark push <60s）**

目标：实现推送通道，Bark（iOS Critical Alerts）+ Discord webhook，让 8-K 事件能在 60 秒内推送到手机。

具体要求：
1. 在 `packages/delivery/` 创建 TypeScript delivery 包：
   - `BarkPusher` — Bark API 调用（POST https://api.day.app/push）
     - 支持 Critical Alerts（`isArchive=0`, `sound=` 自定义）
     - 配置：BARK_API_KEY, BARK_SOUND (默认 "alarm")
   - `DiscordWebhook` — Discord webhook 调用（POST webhook URL）
     - 支持 embed 格式显示事件摘要
     - 配置：DISCORD_WEBHOOK_URL
   - `AlertRouter` — 根据 severity 路由到对应通道：
     - CRITICAL → Bark + Discord
     - HIGH → Bark
     - MEDIUM/LOW → Discord only
2. Node.js backend 集成：
   - 在 `app.ts` 中订阅 EventBus，将 RawEvent 转发给 AlertRouter
   - 配置通过环境变量（用 pydantic-settings 或类似方案）
3. Docker：
   - 更新 `docker-compose.yml` 添加 bark-server 服务（已有 `finab/bark-server`）
   - Bark server 配置：环境变量 `BARK_KEY` 用于认证
4. 测试：
   - Mock Bark API，验证请求格式
   - Mock Discord webhook，验证 embed 格式

完成标准：`docker compose up` 启动后，sec-scanner 收到 8-K → backend → delivery → Discord webhook + Bark push <60s。

---

## 任务队列（按顺序执行）

### Phase 0

- [x] **P0.1** 项目 scaffold ✅
- [x] **P0.2** Scanner 插件框架 ✅
- [x] **P0.3** SEC EDGAR 8-K scanner（Python FastAPI 微服务 + edgartools）✅
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
