# tasks.md — Event Radar 开发任务

> 晚晚指挥 Claude Code 的任务清单。每次启动 CC 前更新 "当前任务"。

---

## 当前任务
**Phase 4 全部完成！** 🎉

P4.1 ✅ P4.2 ✅ P4.3 ✅ P4.4 ✅ P4.5 ✅

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
- [x] **P1A.4** Observability（Prometheus /metrics）✅
- [x] **P1A.5** 集成测试 ✅ (16 integration tests, pipeline e2e)

### Phase 1B

- [ ] **P1B.1** LLM 分类引擎（Stage 2: Claude/GPT + FinBERT）
- [ ] **P1B.2** Tier 2 scanner（Trump Truth Social, Elon X）
- [ ] **P1B.3** 事件去重
- [ ] **P1B.4** Delivery: Telegram + webhook

### Phase 1C

- [x] **P1C.1** Tier 3 scanner（PR Newswire, BusinessWire, GlobeNewswire）— 失败，待重试
- [x] **P1C.2** 分类调优 + confidence UX ✅
- [x] **P1C.3** REST API v1 ✅

### Phase 2

- [x] **P2.1** Frontend scaffold（Next.js + shadcn/ui + dark theme）✅
- [x] **P2.2** Live Event Feed（WebSocket + virtual list）✅
- [ ] **P2.3** Event Detail panel
- [ ] **P2.2** Live Event Feed（WebSocket + virtual list）
- [ ] **P2.3** Event Detail panel
- [x] **P2.4** Chart panel（TradingView Lightweight Charts）✅
- [x] **P2.5** System Health bar + Auth ✅
- [x] **P2.6** Deployment + E2E tests ✅

---

## Phase 2 完成！🎉
- [ ] **P2.6** Deployment + E2E tests

---

## Phase 3 完成！🎉 (2026-03-10)
- [x] P3.1 Social (Reddit + StockTwits) — PR #17
- [x] P3.2 Macro (EconCal + FedWatch + Breaking News) — PR #18
- [x] P3.3 Smart Money (Congress + Options + Short Interest) — PR #19
- [x] P3.4 Tier 1 Gov (FDA + White House + DOJ) — PR #20
- [x] P3.5 Analyst + Earnings + WARN — PR #21
- [x] P3.6 Scanner Plugin SDK — PR #22

---

## Phase 4: Intelligence Layer 🧠 (待启动)

### P4.1 多信号关联引擎
- [x] **P4.1.1** 事件相似度匹配算法 ✅ PR #26
  - 基于 ticker + 时间窗口 + 关键词重叠度计算相似度
  - Jaccard index + 指数衰减时间接近度
- [x] **P4.1.2** 跨源事件去重 & 合并 ✅ PR #28
  - 同一事件从多个源收到 → 合并为一个事件
  - 保留所有来源链接
- [x] **P4.1.3** "Developing Story" 分组 ✅ PR #29
  - 30分钟内关联事件归为一组
  - Group ID + sequence number, 17 tests
- [x] **P4.1.4** 多源确认自动升级 ✅ PR #30
  - 2+源确认同一事件 → severity 升级
  - 16 tests

### P4.2 回测框架 ✅ (2026-03-10)
- [x] **P4.2.1** 历史价格数据获取 — PR #23
- [x] **P4.2.2** 事件结果追踪表 — PR #24
- [x] **P4.2.3** 胜率分析 API — PR #25

### P4.3 准确率追踪 & 自改进
- [x] **P4.3.1** 分类准确率记录 ✅ PR #31 (17 tests)
- [x] **P4.3.2+P4.3.3** 方向信号准确率 & 用户反馈 ✅ PR #32 (26 tests)
- [x] **P4.3.4** 自适应分类调整 ✅ PR #33 (24 tests)
### P4.4 智能告警 & 规则引擎
- [x] **P4.4.1+P4.4.2** 自定义规则 DSL + 解析器 ✅ PR #34
  - 递归下降 DSL parser, AND/OR 优先级, NOT/IN/CONTAINS/MATCHES
  - Rule engine v2: first-match-wins, CRUD API, test/validate endpoints
  - 26 tests (11 parser + 8 engine + 7 API), 2279 行
- [x] **P4.4.3+P4.4.4** 告警预算系统 + 渐进式 Severity ✅ PR #35
  - 告警流量控制: 每小时预算、按优先级分配、CRITICAL 永远放行
  - 渐进式 severity: 多源确认自动升级、用户锁定、降级
  - 21 tests, 1508 行

### P4.5 高级仪表盘
- [x] **P4.5.1+P4.5.2** 历史事件浏览器 + 板块热力图 ✅ PR #38
  - 事件历史浏览器: 日期范围、多维度筛选、分页、排序、URL 同步
  - 板块热力图: CSS grid、severity 着色、点击联动浏览器
  - GICS 板块映射、backend 聚合 API
  - 713 backend tests passed
- [x] **P4.5.3+P4.5.4** 事件影响图表 + 多窗口支持 ✅ PR #40
  - TradingView lightweight-charts K 线图 + 事件标记
  - BroadcastChannel 多窗口同步、可 detach 面板
  - 2516 行, 725 tests, 晚晚手动修复 3 个 TS build errors

---

## Phase 4 任务顺序 (建议)

1. P4.2 回测框架 (基础设施，先做)
2. P4.1 关联引擎 (依赖 P4.2 的 outcome 数据)
3. P4.3 准确率追踪 (依赖 P4.2 的 outcome 数据)
4. P4.4 规则引擎 (业务逻辑)
5. P4.5 仪表盘 (前端展示)

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
