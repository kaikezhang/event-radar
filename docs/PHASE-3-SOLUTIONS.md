# Phase 3 — 解决方案设计

**日期:** 2026-03-22
**基于:** Alex's Review (B-)
**目的:** 对每个 Trust Killer 设计具体技术方案，供 CC + Codex review

---

## TK1: Watchlist 幽灵 Ticker

### 问题描述
用户 onboarding 选了 4 个 ticker（NVDA, AAPL, TSLA, META），但 watchlist 显示 13 个（包括 MUR, CING, SWMR 等从未选择的）。导致：
- Popular ticker 按钮全部 disabled（因为 `alreadyOnWatchlist.has(ticker)` 为 true）
- Watchlist feed 显示无关事件
- "11 alerts this week" 统计包含无关 ticker

### 根因分析
`AUTH_REQUIRED=false` 时所有请求共享 `userId='default'`。之前的测试 session 往 watchlist 表添加过 ticker，这些数据永远留在 default userId 下。新 session 进来看到的是旧数据。

### 解决方案

**方案 A: Onboarding 重置 watchlist（推荐）**
```
Onboarding 完成时:
1. DELETE FROM watchlist WHERE user_id = 'default'
2. INSERT 用户选择的 ticker
```
- 优点: 简单，保证干净状态
- 缺点: 如果用户重复做 onboarding 会丢掉之前的 watchlist
- 缓解: 只在 `onboardingComplete` key 不存在时执行 reset

**方案 B: Per-session userId**
```
每个新浏览器 session 生成唯一 userId (UUID)
存在 localStorage，后续请求携带
```
- 优点: 根本解决多用户隔离
- 缺点: 需要改动更多代码（auth middleware, API routes, DB queries）

**方案 C: Onboarding 清理 + 前端过滤（混合）**
```
1. Onboarding 选 ticker 前，先调 API 清空 watchlist
2. 同时前端的 onboarding 组件不再查 alreadyOnWatchlist
   → popular buttons 永远可点
3. 选完后 batch insert
```

**推荐: 方案 C** — 最小改动，解决两个问题（幽灵 ticker + disabled 按钮）

### 实现细节
1. `Onboarding.tsx`: 移除 `alreadyOnWatchlist` 检查，或在 step 2 开始时调 `DELETE /api/v1/watchlist/reset`
2. 后端: 加 `DELETE /api/v1/watchlist/reset` endpoint，清空当前 userId 的 watchlist
3. Onboarding 完成时: batch POST 用户选择的 ticker

---

## TK2: 财报数据错误

### 问题描述
META Q3 2025 显示 "EPS $1.05 vs $6.71 (-84.3% miss)" — 实际 META Q3 2025 EPS 是 ~$6.03 vs $5.25 est (+14.9% beat)。

### 根因分析
yfinance `earnings_history` 的 index 是按 fiscal quarter end date 排的，但 EPS 数据跟 `earnings_dates` 的对应关系可能错位。一个 ticker 的 fiscal year end 可能不是 12/31（比如 META 的 fiscal year = calendar year，但 quarter index 可能按报告日期排序）。

### 解决方案

**方案: 验证 + 重新导入**

1. **验证脚本**: 对每个 ticker，用 yfinance 拉数据，跟 Yahoo Finance 网页版对比
2. **交叉验证**: 用 `t.quarterly_income_stmt` 的 "Diluted EPS" 行作为 ground truth
3. **清理**: DELETE 所有 `source='yahoo-finance'` 的 events
4. **重新导入**: 用验证后的正确数据重新插入
5. **增加校验**: 导入时检查 `abs(surprise%) > 50%` 的数据 → 标记为可疑，人工确认

### 实现细节
```python
# 交叉验证
t = yf.Ticker('META')
income = t.quarterly_income_stmt
eps_from_income = income.loc['Diluted EPS']  # Ground truth
eps_from_history = t.earnings_history  # 可能有错

# 比较两个来源，用 income_stmt 的为准
```

---

## TK3: 搜索不可靠

### 问题描述
- "earnings" 返回 0 结果（DB 有 172 个 earnings 事件）
- "tariff" 第一次无结果，第二次有（timing issue）

### 根因分析

**"earnings" 搜不到:**
PostgreSQL 全文搜索用 `plainto_tsquery`，它会把 "earnings" 转成 tsvector token。但事件标题格式是 "AAPL Q4 2025 Earnings: Beat..."，如果 tsvector 生成时没 normalize 大小写，或搜索 query 的 parser 把 "earnings" 理解为普通词而非搜索词，可能匹配不上。

可能的问题:
- `to_tsvector('english', title)` 会把 "Earnings" stem 成 "earn"
- `plainto_tsquery('english', 'earnings')` 也会 stem 成 "earn"
- 但如果搜索的字段不包含 "earnings" 事件（只搜了 title + summary，但 backfill 事件的字段可能在不同位置）

**"tariff" timing issue:**
前端 debounce 可能在用户输入过程中取消了第一个请求，或 React Query 的 staleTime 导致第一次返回缓存空结果。

### 解决方案

**3.1 后端搜索修复**
- 检查 `/api/events/search` 的 SQL：确认 `to_tsvector` 覆盖了正确的字段（title + summary + event_type）
- 对 backfill 事件（source='yahoo-finance'），确认 title 和 summary 字段有内容
- 加 ILIKE fallback: 如果 tsvector 搜索返回 0 结果，用 `title ILIKE '%earnings%'` 做 fallback

**3.2 前端搜索修复**
- 检查 debounce delay（应该 300-500ms）
- 确认 tab 切换到 Events 时不保留旧的 query state
- 搜索 loading 状态要区分 "searching..." vs "no results"

---

## TK4: Evidence Tab 空白

### 问题描述
Event Detail 的 Evidence tab 完全空白，只显示 Share 按钮和 sidebar。

### 根因分析
Sprint 4 (PR #185) 重构了 Event Detail tabs，把内容分配到 Summary/Evidence/Trust。但 Evidence tab 的实际内容（Market Context, Source Details, Risk Factors）可能没有被正确渲染，或者组件没有接收到数据。

### 解决方案

**检查并修复 Evidence tab 渲染**

1. 检查 `EventDetail/index.tsx` 的 tab 切换逻辑
2. Evidence tab 应显示:
   - **Market Context** (from LLM enrichment `metadata.llm_enrichment.marketContext`)
   - **Source Details** (source URL, original text, confidence breakdown)
   - **Risk Factors** (from LLM enrichment `metadata.llm_enrichment.risks`)
3. 如果 LLM enrichment 数据不存在（旧事件/backfill 事件），显示:
   - 原始来源链接
   - "AI analysis not available for this event — it was detected before our enrichment pipeline was active."

---

## TK5: WebSocket 掉线

### 问题描述
30 分钟内多次 Connected → Reconnecting → Offline 切换。

### 根因分析

两个可能:
1. **Vite dev proxy WS 不稳定**: dev 环境的 WS proxy 可能有 idle timeout
2. **Backend WS 缺少 heartbeat**: 没有 ping/pong 保活机制，idle 连接被中间层关闭
3. **Cloudflared tunnel timeout**: tunnel 可能对 WS 连接有 idle timeout

### 解决方案

**5.1 Backend WS Heartbeat**
```typescript
// websocket.ts
setInterval(() => {
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.ping(); // Send ping every 30s
    }
  }
}, 30_000);
```

**5.2 Frontend reconnect 改进**
- 现有 backoff 上限 60s — OK
- 加: 页面 visible 时触发重连（`visibilitychange` event）
- 加: 重连时显示 "Reconnecting..." toast 而非只改状态点颜色

**5.3 Vite proxy WS 配置**
```typescript
// vite.config.ts
server: {
  proxy: {
    '/ws': {
      target: 'http://localhost:3001',
      ws: true,
      timeout: 0, // No timeout for WS
    }
  }
}
```

---

## 额外问题（非 Trust Killer 但重要）

### E1: Notification Settings 加载失败
- 原因: Sprint 8 的 auth middleware 在 AUTH_REQUIRED=false 时可能阻断了 notification-settings API
- 修复: 确认 `/api/v1/settings/notifications` 在 AUTH_REQUIRED=false 时返回 200

### E2: Feed 事件去重
- 问题: StockTwits trending 连续 4 条几乎相同
- 修复: 前端侧对同 source + 同 ticker 的事件在 24h 内只显示最新一条
- 或: 后端 pipeline deduplicator 加 title similarity 检查（已有但阈值可能不对）

### E3: Direction 标签校准
- 问题: Iran 军事威胁标为 NEUTRAL
- 修复: truth-social geopolitical events 应该由 LLM prompt 决定方向，检查 prompt 是否正确传递了 source 信息

---

## Review 问题

请 CC 和 Codex 分别回答：

1. 方案设计是否合理？有没有更好的替代方案？
2. 有没有边界情况或风险没考虑到？
3. 实现优先级排序是否正确？
4. 预估工作量是否合理？
