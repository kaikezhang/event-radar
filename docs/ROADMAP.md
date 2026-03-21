# Event Radar — Unified Roadmap

**Date:** 2026-03-21 (updated)
**Based on:** CC + Codex comprehensive analyses

## Product Vision

> Self-hosted, event-driven, AI-assisted alert intelligence with visible receipts.

不跟 Benzinga 比新闻速度，不跟 AlphaSense 比研究深度，不跟 Trade Ideas 比扫描器。
我们的护城河是：**开源 + 可审计 pipeline + outcome tracking + 多源事件检测**。

---

## Phase 1: Foundation Hardening ✅ COMPLETE

### Batch 1 — Architecture Cleanup ✅
- [x] **拆分 app.ts** 1418→457行 (-68%) — PR #156
- [x] **拆分 Feed.tsx** 990→140行 (-86%) — PR #159
- [x] **拆分 EventDetail.tsx** 1206→236行 (-80%) — PR #160

### Batch 2 — Test & CI Stabilization ✅
- [x] **修 web 测试** 28/28 pass, 147/147 tests — PR #161
- [x] **修 backend 测试** 110/110 pass, 1482/1482 tests — PR #162
- [ ] **重启 E2E 测试** — CI 加 Docker Compose
- [ ] **加 coverage 报告** — `@vitest/coverage-v8`

### Batch 3 — Contract & Doc Cleanup ✅
- [x] **修文档漂移** — Next.js → Vite+React 19 — direct commit
- [ ] **统一 source naming** — 低优先级
- [ ] **统一前后端类型** — 低优先级

---

## Phase 2: Pipeline Durability (进行中)

### Batch 4 — Redis EventBus ✅
- [x] **引入 Redis Streams 替代内存 EventBus** — PR #174, #175, #176 (consumer groups, fanout, unsubscribe safety)
- [x] **持久化 dedup 窗口** — PR #177 (Redis sorted set, hydration on startup)
- [ ] ~~**story-group 接入 live pipeline**~~ — deferred (API exists but not wired to pipeline, low priority)

### Batch 5 — Auth & Security Hardening ✅
- [x] **默认 AUTH_REQUIRED=true** — PR #167
- [x] **加 CSP headers** — PR #167
- [x] **加 WebSocket rate limiting** — PR #167 (10 conn/IP/min, 100 msg/conn/min)
- [x] **WebSocket header auth** — PR #167 (Sec-WebSocket-Protocol subprotocol)
- [ ] **多用户隔离** — 需要 RBAC 支持

### Batch 6 — Operational Improvements ✅
- [x] **Scanner interval 配置化** — PR #165 (env var override in BaseScanner)
- [x] **Dark mode** — PR #163 (23 files, Light/Dark/System)
- [x] **Scorecard 加入主导航** — PR #165 (5th tab)

---

## Phase 3: Product Polish (部分完成)

### Batch 7 — Desktop & UX ✅
- [x] **桌面双栏布局** — PR #168 (already existed, confirmed)
- [x] **键盘快捷键** — PR #168 (j/k/Enter/Escape)
- [x] **Onboarding 优化** — PR #171 (multi-step wizard)
- [x] **Feed/Push 分级 UI** — PR #173 (signal tier badges + filter)

### Batch 8 — Historical & Intelligence (部分完成)
- [ ] **历史事件回填** — 从 SEC/政府源回填 2-3 年数据
- [x] **历史浏览器** — PR #172 (按 sector/event type 浏览历史事件)
- [x] **Audio Squawk** — PR #169 (browser SpeechSynthesis)
- [x] **Source 命中率可视化** — PR #170 (Recharts, 3 chart types)

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
