# Event Radar — Unified Roadmap

**Date:** 2026-03-20
**Based on:** CC + Codex comprehensive analyses

## Product Vision

> Self-hosted, event-driven, AI-assisted alert intelligence with visible receipts.

不跟 Benzinga 比新闻速度，不跟 AlphaSense 比研究深度，不跟 Trade Ideas 比扫描器。
我们的护城河是：**开源 + 可审计 pipeline + outcome tracking + 多源事件检测**。

---

## Phase 1: Foundation Hardening (2 weeks)

可靠性优先，不加新功能。两份分析都强调这是最高 ROI。

### Batch 1 — Architecture Cleanup (3-4 days)
- [ ] **拆分 app.ts (1418行)** → `pipeline/index.ts`, `scanner-manager.ts`, `websocket-manager.ts`, `route-loader.ts`，app.ts 降到 ~200 行
- [ ] **拆分 Feed.tsx (990行)** → `FeedFilters`, `FeedList`, `FeedCard` 等子组件
- [ ] **拆分 EventDetail.tsx (1206行)** → `EventHeader`, `EventEnrichment`, `EventHistory`, `EventChart`

### Batch 2 — Test & CI Stabilization (3-4 days)
- [ ] **修 web 测试** — `useAlerts.test.tsx` (Maximum update depth), `matchMedia` mock, lightweight-charts jsdom 兼容
- [ ] **重启 E2E 测试** — CI 加 Docker Compose，跑关键 pipeline 路径 E2E
- [ ] **加 coverage 报告** — `@vitest/coverage-v8`，设 70% 最低门槛
- [ ] **修 PGlite test timeout** — 根治 cleanup 问题而非 120s workaround

### Batch 3 — Contract & Doc Cleanup (2-3 days)
- [ ] **修文档漂移** — AGENTS.md, ARCHITECTURE.md, FRONTEND.md 还在说 Next.js，改成 Vite+React 实际情况
- [ ] **统一 source naming** — pipeline 各阶段 source identifier 不一致，会导致 gatekeeper 策略错误
- [ ] **统一前后端类型** — web 包的类型应复用 `@event-radar/shared`，不要重复定义

---

## Phase 2: Pipeline Durability (2-3 weeks)

单点故障消除。两份分析一致认为这是最大结构性风险。

### Batch 4 — Redis EventBus (1 week)
- [ ] **引入 Redis Streams 替代内存 EventBus** — 崩溃不丢事件，支持重播
- [ ] **持久化 dedup 窗口** — 当前内存滑动窗口 OOM 会丢状态
- [ ] **story-group 接入 live pipeline** — 或者删掉这个 claim

### Batch 5 — Auth & Security Hardening (1 week)
- [ ] **默认 AUTH_REQUIRED=true** — production 路径不能 open
- [ ] **多用户隔离** — 停止把未认证请求塌缩到 `default` 用户
- [ ] **删 WebSocket query-string API key** — 安全隐患
- [ ] **加 CSP headers** — XSS 防护
- [ ] **加 WebSocket rate limiting** — 防滥用

### Batch 6 — Operational Improvements (3-4 days)
- [ ] **Scanner interval 配置化** — 从硬编码移到 env vars
- [ ] **Dark mode** — Tailwind `dark:` 变体 + 系统偏好检测
- [ ] **Scorecard 加入主导航** — 当前隐藏太深

---

## Phase 3: Product Polish (3-4 weeks)

从"能用"到"好用"。

### Batch 7 — Desktop & UX (1-2 weeks)
- [ ] **桌面双栏布局** — feed + detail 并排
- [ ] **键盘快捷键** — j/k 导航、s 收藏、f 过滤
- [ ] **Onboarding 优化** — 围绕 watchlist + push + trust 说明
- [ ] **Feed/Push 分级 UI** — 清晰区分"仅 feed"和"推送"信号

### Batch 8 — Historical & Intelligence (2 weeks)
- [ ] **历史事件回填** — 从 SEC/政府源回填 2-3 年数据，pattern matching 质量依赖历史深度
- [ ] **历史浏览器** — 按 sector/event type 浏览历史事件
- [ ] **Audio Squawk** — TTS 朗读 critical/high 事件（browser SpeechSynthesis 或 MiniMax）
- [ ] **Source 命中率可视化** — 把 scorecard 做成核心差异化功能

---

## Phase 4: Scale & Monetization (6-12 months)

### 架构演进
- [ ] **分离 runtime 角色** — scanner workers / pipeline workers / API server / scheduled jobs
- [ ] **PostgreSQL read replicas** + connection pooling
- [ ] **Custom ML classifier** — 用积累的 event+outcome 数据训练，替代 GPT-4o-mini
- [ ] **Learn-to-rank alert quality** — 从 outcome 和 user feedback 学习排序

### 产品扩展
- [ ] **Hosted SaaS** — Freemium: Free(延迟5分钟) / Pro($29/月) / Trader($79/月)
- [ ] **RBAC** — admin/analyst/viewer 角色
- [ ] **Enterprise API** — REST + WebSocket + webhook + 自定义过滤 DSL
- [ ] **国际市场** — EU(ESMA/ECB), UK(FCA/BoE), Asia(HKEX/TSE)
- [ ] **Portfolio integration** — 对接 Alpaca/IB，只推送影响持仓的事件

---

## 定价策略（SaaS 阶段）

| Tier | 价格 | 特性 |
|------|------|------|
| Free | $0 | Feed(5分钟延迟), 3 watchlist, web only |
| Pro | $29/月 | 实时 feed, 无限 watchlist, push(20/天), API(100 req/hr) |
| Trader | $79/月 | + Audio squawk, API(1000 req/hr), 自定义 alert DSL |
| Enterprise | Custom | 独立实例, SLA, WebSocket firehose, 自定义 scanner |

低于 Benzinga Pro($37-177), Unusual Whales($48), The Fly($45-75)。
自托管永远免费，保持开源信誉。

---

## 立即开始: Phase 1 Batch 1

**任务**: 拆分 app.ts — 项目最大的技术债
