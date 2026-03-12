# Event Radar — Go-Live Plan

## 现状
- 136 commits, 200 TS files, ~20K LOC, 885 tests
- 18 个 scanner 代码完成，pipeline 全通路（eventBus → classify → dedup → store → alert → delivery）
- 前端 Dashboard 完成（Next.js 15 + shadcn/ui）
- Docker Compose + Dockerfile 就绪
- **缺失**：DB migration、.env 配置、端到端验证、部署

## Go-Live 路线图

### Phase A: 数据通路 🔌 （优先级最高）

**A.1 — DB Migration + .env 配置**
- 生成 drizzle migration（`pnpm --filter @event-radar/backend db:generate`）
- 创建 `.env.example` + `.env`（所有 env var 文档化）
- 启动 PG（docker compose 或本地）→ `db:push` 建表
- 验证：连接 PG，表结构正确

**A.2 — 端到端 Smoke Test**
- 启动 backend（连 PG）
- 验证 scanner 注册 + 开始 poll
- 等待第一个真实事件入库（Breaking News RSS 最快）
- 验证：`GET /api/v1/events` 返回真实事件
- 验证：事件经过分类、存入 DB
- 修复任何运行时错误

**A.3 — Delivery 验证**
- 配置 Discord webhook URL
- 配置 Bark push（主人 iPhone）
- 发一个测试事件 → 验证 push 到达
- 验证 alert routing（severity → channel mapping）

### Phase B: 前端连接 🖥️

**B.1 — Frontend ↔ Backend 连通**
- 配置 frontend API URL（环境变量）
- 验证 Dashboard 显示真实事件
- WebSocket live feed 验证
- 修复任何前端渲染问题

### Phase C: 部署上线 🚀

**C.1 — 本机 Docker Compose 运行**
- `docker compose up` 一键启动（PG + backend）
- 前端 dev server 或 build + serve
- 验证全链路：scanner → DB → API → Dashboard → Push

**C.2 — 生产部署（Hetzner VPS）**
- 部署到当前 VPS
- 用 systemd 或 docker compose 持久运行
- Cloudflare tunnel 暴露 Dashboard
- SSL + 基本安全

### Phase D: 稳定性 🛡️

**D.1 — 监控告警**
- Prometheus metrics 验证（`/metrics` endpoint 已有）
- scanner 健康度监控
- 错误告警推 Discord

**D.2 — Scanner 逐步启用**
- 第一批（免费 RSS，最稳定）：Breaking News, Fed RSS, WhiteHouse, FDA, DOJ
- 第二批（需 API key）：Reddit, StockTwits
- 第三批（需浏览器）：Truth Social, X（Playwright scraping）
- SEC EDGAR（Python 微服务，单独部署）

---

## 任务顺序

A.1 → A.2 → A.3 → B.1 → C.1 → C.2 → D.1 → D.2

A.1-A.3 可以一个 CC session 搞定。
B.1 可能需要单独一轮。
C.1-C.2 晚晚可以自己做（docker + deploy 不需要 coding agent）。
