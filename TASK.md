# TASK.md — Admin Dashboard Observability

## Overview

增强 Admin Dashboard 的可观测性。现有 dashboard 已有 Overview（Scanner Grid + Pipeline Funnel + Filter Breakdown）、Audit Trail、Historical 三个页面。本次增强的核心目标：**让管理员一眼看清系统在干什么、为什么 block、怎么操控**。

Dashboard 前端在 `packages/dashboard/`，使用 React + TanStack Query + Recharts + Tailwind CSS + Lucide icons。
后端在 `packages/backend/`。

设计风格：保持现有 dark theme（`radar-bg`, `radar-surface`, `radar-border`, `radar-green`, `radar-red`, `radar-amber`, `radar-blue`, `radar-text`, `radar-text-muted`）。

---

## Task A: LLM Judge Transparency Panel (Codex)

让管理员看到 LLM Judge 在干什么 — 通过/拒绝了哪些事件、为什么。

### Backend

1. **新 API**: `GET /api/v1/judge/recent?limit=50`
   - 从 `pipeline_audit` 表查询 `stopped_at = 'llm_judge'` 的记录
   - 返回: `{ events: [{ id, title, source, severity, decision, confidence, reason, ticker, at }] }`
   - 也包含 `outcome = 'delivered'` 且经过 LLM Judge 的事件（judge passed）
   - 按时间倒序

2. **新 API**: `GET /api/v1/judge/stats`
   - 统计 by source 的通过/拒绝数量
   - 返回: `{ bySource: { "breaking-news": { passed: 2, blocked: 5 }, ... }, total: { passed: 10, blocked: 30 } }`
   - 可选 `?since=1h|24h|7d` 时间范围

3. **增强 Audit Trail 数据**: 在 `/api/v1/audit` 的返回中增加 `llm_enrichment` 字段（如果事件有 AI enrichment），包含：
   - `analysis` (AI 分析全文)
   - `action` (建议 action)
   - `tickers` (提取的 ticker 列表)
   - `regimeContext` (regime 上下文)
   - `confidence` (LLM judge confidence)

### Frontend (`packages/dashboard/`)

1. **Overview 新增 LLM Judge Card**:
   - 通过/拒绝比例 donut chart（用 Recharts PieChart）
   - By source 的通过率 bar chart
   - 最近 5 个判定：title + source + decision badge (PASS 绿 / BLOCK 红) + confidence + reason 摘要

2. **Audit Trail 增强**:
   - 展开详情里增加 LLM Enrichment 区域
   - 如果事件有 AI 分析：显示完整 analysis + action + tickers + regime context
   - LLM Judge confidence 用 progress bar 展示

3. **新 hooks**: `useJudgeRecent()`, `useJudgeStats()`

---

## Task B: Market Regime + Delivery Control Panel (Codex)

### Backend

1. **新 API**: `GET /api/v1/regime/history?hours=24`
   - 返回 regime score 时序数据（从内存 cache 或 DB）
   - 格式: `{ snapshots: [{ at, score, vix, spy, regime, factors: { rsi, ma_cross, yield_curve, ... } }] }`
   - 如果没有历史数据，从当前 snapshot 开始累积（每次 regime 更新时存一个点）

2. **增强 `/api/v1/dashboard`**: 在返回中增加:
   - `regime` 字段: 完整 regime snapshot（不只是 vix/spy/regime，还要 score + 所有因子）
   - `delivery_control` 字段: kill switch 状态 + 最后操作时间 + 操作者

### Frontend (`packages/dashboard/`)

1. **Overview 新增 Market Regime Card**:
   - 当前 regime badge（BULL 🟢 / BEAR 🔴 / CORRECTION 🟡 / NEUTRAL ⚪）
   - Regime score gauge（-100 到 +100 的仪表盘）
   - 关键因子一行：VIX | SPY RSI | MA Cross | Yield Curve
   - 点击展开 → 所有因子详细值

2. **Overview 新增 Delivery Control Card**:
   - Kill Switch 状态灯 + 一键 toggle 按钮（POST `/api/admin/delivery/kill` 或 `/resume`）
   - 每个 delivery channel 的统计：sent / errors / last success time
   - 需要 API_KEY 鉴权（从 Settings 或 env 读取）

3. **全局 Auto-refresh**: 所有 useQuery 加 `refetchInterval: 15_000`（15 秒刷新）

---

## Task C: Scanner Deep Dive + Alert Feed Page (Codex)

### Backend

1. **新 API**: `GET /api/v1/scanners/:name/events?limit=10`
   - 返回指定 scanner 最近产出的事件
   - 从 `events` 表按 source 查询

2. **新 API**: `GET /api/v1/delivery/feed?limit=20`
   - 只返回 delivered 事件 + 完整 enrichment
   - 包含：title, source, severity, tickers, AI analysis, action, regime context, delivery channels, delivered_at
   - Cursor pagination

### Frontend (`packages/dashboard/`)

1. **Scanner Card 可展开**:
   - 点击 scanner card → 展开 drawer 或 modal
   - 显示：最近 10 个事件列表、最近错误详情、events/hour 产出率
   - 用 ScannerCard.tsx 改造

2. **新页面: Alert Feed** (`pages/AlertFeed.tsx`):
   - 在 App.tsx 导航加新 tab（Bell icon + "Alerts" label）
   - 卡片式布局，每个 delivered alert 一张卡：
     - 标题（粗体）+ source badge + severity badge
     - AI 分析摘要（前 200 字）
     - Tickers（黄色 mono）
     - Delivery channels（Discord ✅ / Bark ✅）
     - 送达时间
   - 空状态：友好提示 "No alerts delivered yet"
   - Cursor 分页（Load More 按钮）

3. **新 hooks**: `useScannerEvents(name)`, `useDeliveryFeed()`

---

## General Rules

- TypeScript strict mode, ESM with `.js` extensions in imports
- 保持现有设计风格（dark theme, radar-* colors）
- 新组件用现有 Card, StatusBadge, LoadingSpinner 组件
- Charts 用 Recharts（已在依赖中）
- 后端新 route 需要注册到 app.ts
- Run `pnpm build` + `pnpm test` + `pnpm lint` — 全部通过
- Create feature branch + PR. Do NOT push to main. Do NOT merge PRs.
- 新增的前端页面/组件需要有 test 文件
