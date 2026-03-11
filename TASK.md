# Current Task: P4.5.1+P4.5.2 — 历史事件浏览器 & 板块热力图

## Goal
实现高级仪表盘的前端组件：历史事件浏览器（搜索/筛选/分页）和板块热力图（按 GICS 板块可视化事件密度）。

## Requirements

### 1. Backend: Events History API (`packages/backend/src/routes/events-history.ts`)
- `GET /api/v1/events/history` — 历史事件查询
  - Query params: `ticker`, `source`, `severity`, `type`, `dateFrom` (ISO), `dateTo` (ISO), `page` (default 1), `pageSize` (default 50, max 200), `sortBy` (default 'timestamp'), `sortOrder` (default 'desc')
  - Response: `{ data: Event[], pagination: { page, pageSize, totalCount, totalPages } }`
  - 需要 API key auth
- `GET /api/v1/events/sectors` — 按 GICS 板块聚合
  - Query params: `dateFrom`, `dateTo`, `severity`
  - Response: `{ sectors: Array<{ sector: string, count: number, criticalCount: number, highCount: number, tickers: string[] }> }`
  - GICS 板块映射：ticker → sector（内置常见 ticker 映射表 + metadata.sector fallback）
  - 需要 API key auth

### 2. Frontend: Event History Browser (`packages/frontend/src/components/event-history-browser.tsx`)
- 日期范围选择器（shadcn/ui DatePickerWithRange, or simple date inputs）
- 多维度筛选面板:
  - Source: multi-select dropdown（从 API 获取可用 sources）
  - Severity: checkbox group (CRITICAL/HIGH/MEDIUM/LOW)
  - Ticker: 文本输入，支持逗号分隔多个
  - Event Type: multi-select dropdown
- 事件列表: 使用 HTML table with shadcn/ui Table（保持简单）
  - 列: Timestamp, Ticker, Source, Type, Severity badge, Direction, Headline
  - 可点击行 → 展开详情（inline expand, no modal）
  - 排序支持（点击列标题切换 sortBy/sortOrder）
- 分页: 简单的 Prev/Next + 页码显示
- URL 参数同步（筛选条件写入 URL search params，支持分享链接）
- Loading skeleton + 空状态

### 3. Frontend: Sector Heatmap (`packages/frontend/src/components/sector-heatmap.tsx`)
- 用 CSS grid 实现热力图（不引入 recharts 新依赖）
- 每个方块 = 一个 GICS 板块
- 方块大小 = 按事件数量分配 grid area（或使用 flex-grow 按比例）
- 颜色 = severity 分布（红色调=多 CRITICAL/HIGH，绿色调=低 severity 为主，灰色=无事件）
- Hover tooltip: 板块名 + 事件数 + 主要 ticker（用 title attribute 或简单 tooltip）
- 点击板块 → 更新事件浏览器筛选条件（通过 URL params 或 state 联动）
- 日期范围联动（和事件浏览器共享日期）

### 4. Frontend: Dashboard Page (`packages/frontend/src/app/dashboard/history/page.tsx`)
- 新路由 `/dashboard/history`
- 上方: 板块热力图
- 下方: 事件历史浏览器
- 侧边栏导航添加 "History" 入口（如果侧边栏存在）

### 5. GICS 板块映射 (`packages/backend/src/data/sector-map.ts`)
- 内置常见 ticker → GICS sector 映射（至少 50 个主要 ticker）
- 11 个 GICS 板块: Technology, Healthcare, Financials, Consumer Discretionary, Consumer Staples, Industrials, Energy, Utilities, Real Estate, Materials, Communication Services
- Fallback: event.metadata.sector 或 "Other"

### 6. Tests (≥8 tests)
- Backend: 历史查询分页正确
- Backend: 日期范围筛选
- Backend: severity 筛选
- Backend: ticker 筛选
- Backend: 板块聚合返回正确结构
- Backend: API auth 验证
- Backend: 空结果
- Backend: pageSize 上限 200

## Files to create/modify
- `packages/backend/src/routes/events-history.ts` — 历史查询 API
- `packages/backend/src/data/sector-map.ts` — GICS 映射
- `packages/backend/src/app.ts` — 注册 routes
- `packages/backend/src/__tests__/events-history.test.ts`
- `packages/shared/src/schemas/history-types.ts` — 分页/聚合类型（可选）
- `packages/shared/src/index.ts` — export（如有新 types）
- `packages/frontend/src/components/event-history-browser.tsx`
- `packages/frontend/src/components/sector-heatmap.tsx`
- `packages/frontend/src/app/dashboard/history/page.tsx`

## Key Constraints
- 不要引入 recharts、AG Grid 等重依赖。用 CSS grid + shadcn/ui Table 保持轻量
- @tanstack/react-table 可以用（如果已安装），否则用 shadcn Table
- 检查 packages/frontend/package.json 已有哪些依赖，优先复用
- 前端样式用 Tailwind CSS，遵循现有 dark theme 设计

## Verification
- `pnpm build && pnpm --filter @event-radar/backend lint` must pass
- All tests pass
- Create branch `feat/history-dashboard`, commit, push, create PR to main
- **DO NOT merge the PR. DO NOT run gh pr merge.**
