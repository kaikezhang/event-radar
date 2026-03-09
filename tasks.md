# tasks.md — Event Radar 开发任务

> 晚晚指挥 Claude Code 的任务清单。每次启动 CC 前更新 "当前任务"。

---

## 当前任务
**Phase 0.3 — SEC EDGAR 8-K Scanner（Python FastAPI 微服务 + edgartools）**

目标：创建 Python 微服务，轮询 SEC EDGAR EFTS API 获取最新 8-K filing，解析关键 item，通过 HTTP 推送 RawEvent 到 Node.js backend。

具体要求：
1. 在 `services/sec-scanner/` 中创建 Python FastAPI 微服务：
   - 使用 `edgartools` 库解析 8-K filing
   - 轮询 SEC EDGAR EFTS API（`https://efts.sec.gov/LATEST/search-index?q=%228-K%22&dateRange=custom&startdt=TODAY&enddt=TODAY`）
   - 解析 8-K item types（1.01 Entry into Material Agreement, 1.02 Bankruptcy, 2.01 Acquisition, 5.02 CEO Change, 7.01 Regulation FD, 8.01 Other Events 等）
   - 提取：公司名、CIK、ticker（通过 SEC company tickers API）、filing date、item types、filing URL
   - 生成 RawEvent 并 POST 到 Node.js backend（`POST /api/events/ingest`）
2. 在 Node.js backend 添加：
   - `POST /api/events/ingest` endpoint — 接收 RawEvent，发布到 EventBus
   - 验证 RawEvent schema（用 zod）
3. Python 微服务配置：
   - `SEC_POLL_INTERVAL` 环境变量（默认 30s）
   - `BACKEND_URL` 环境变量（默认 `http://localhost:3001`）
   - SEC User-Agent header（SEC 要求提供联系邮箱）
   - Rate limiting（SEC 限制 10 requests/sec）
4. Docker:
   - `services/sec-scanner/Dockerfile`
   - `docker-compose.yml`（sec-scanner + backend）
5. 测试：
   - Python: pytest，mock SEC API response，验证 8-K 解析
   - Node.js: 测试 ingest endpoint

完成标准：`docker compose up` 启动后，sec-scanner 自动轮询 SEC，解析 8-K，推送到 backend，`GET /health` 显示 sec-scanner 状态。

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
