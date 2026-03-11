# Current Task: P4.5.3+P4.5.4 — 事件影响图表 & 多窗口支持

## Goal
实现事件在 K 线图上的标注可视化，以及通过 BroadcastChannel 支持多窗口同步。

## Requirements

### 1. Backend: Event Impact API (`packages/backend/src/routes/event-impact.ts`)
- `GET /api/v1/events/impact` — 获取带价格影响的事件数据
  - Query params: `ticker` (required), `dateFrom` (ISO), `dateTo` (ISO), `severity`
  - Response: `{ events: Array<{ eventId, timestamp, ticker, headline, severity, direction, priceAtEvent, priceChange1h, priceChange1d, priceChange1w }> }`
  - 从 `events` + `classification_outcomes` 表联查
  - 需要 API key auth

### 2. Frontend: Event Impact Chart (`packages/frontend/src/components/event-impact-chart.tsx`)
- 使用已安装的 `lightweight-charts` (TradingView) — 检查 package.json，如果没有则用 recharts 或自定义 SVG
- 显示 K 线图（如果有价格数据）或简单的事件时间线
- 事件标记:
  - 红色标记 = bearish/negative direction
  - 绿色标记 = bullish/positive direction
  - 灰色标记 = neutral/unknown
  - 标记大小 = severity（CRITICAL 最大）
- Hover 事件标记 → tooltip 显示:
  - Headline
  - Severity + Direction
  - T+1h, T+1d, T+1w 价格变化
- Ticker 选择器（文本输入，默认 AAPL）
- 日期范围联动（如果在 history 页面，复用日期选择器）
- 空数据状态处理

### 3. Frontend: Multi-Window Support (`packages/frontend/src/lib/broadcast-sync.ts`)
- 使用 BroadcastChannel API 实现跨窗口/tab 同步
- Channel name: `event-radar-sync`
- 同步内容:
  - 当前选中的 ticker
  - 当前日期范围
  - 当前筛选条件
  - 当前选中的事件 ID
- Message 类型:
  ```typescript
  type SyncMessage =
    | { type: 'ticker-changed'; ticker: string }
    | { type: 'date-range-changed'; dateFrom: string; dateTo: string }
    | { type: 'event-selected'; eventId: string }
    | { type: 'filters-changed'; filters: Record<string, unknown> }
    | { type: 'ping'; windowId: string }
    | { type: 'pong'; windowId: string }
  ```
- React hook: `useBroadcastSync(options)` — 发送和接收同步消息
- 窗口发现: ping/pong 机制检测活跃窗口数量
- 显示活跃窗口数量在状态栏

### 4. Frontend: Detachable Panel (`packages/frontend/src/components/detachable-panel.tsx`)
- "Pop Out" 按钮，打开新窗口显示特定面板
- `window.open()` + BroadcastChannel 保持同步
- 面板类型: 图表、事件列表、事件详情
- 新窗口 URL: `/dashboard/panel/:type?ticker=X&eventId=Y`
- 新页面: `packages/frontend/src/app/dashboard/panel/[type]/page.tsx`

### 5. Dashboard Integration
- 在 `/dashboard/history` 页面添加事件影响图表（在热力图和事件浏览器之间）
- 在状态栏/header 显示同步窗口数量
- 每个面板添加 "Pop Out" 按钮

### 6. Tests (≥6 tests)
- Backend: event impact API 返回正确结构
- Backend: ticker 参数必填验证
- Backend: 日期范围筛选
- Backend: API auth
- Backend: 无匹配事件返回空数组
- Backend: severity 筛选

## Files to create/modify
- `packages/backend/src/routes/event-impact.ts` — impact API
- `packages/backend/src/app.ts` — 注册 routes
- `packages/backend/src/__tests__/event-impact.test.ts`
- `packages/shared/src/schemas/impact-types.ts` — 类型定义（可选）
- `packages/shared/src/index.ts` — export
- `packages/frontend/src/components/event-impact-chart.tsx`
- `packages/frontend/src/lib/broadcast-sync.ts` — BroadcastChannel 工具
- `packages/frontend/src/components/detachable-panel.tsx`
- `packages/frontend/src/app/dashboard/panel/[type]/page.tsx`
- `packages/frontend/src/app/dashboard/history/page.tsx` — 集成图表

## Key Constraints
- 不要引入新的图表库，优先复用已安装的（检查 package.json）
- 如果没有 lightweight-charts，用 CSS + SVG 自己画简单时间线
- BroadcastChannel 不是所有浏览器都支持，要有 fallback（降级为不同步）
- 多窗口功能是增强体验，不是必须的，核心是事件影响图表

## Verification
- `pnpm build && pnpm --filter @event-radar/backend lint` must pass
- All tests pass
- Create branch `feat/event-impact`, commit, push, create PR to main
- **DO NOT merge the PR. DO NOT run gh pr merge.**
