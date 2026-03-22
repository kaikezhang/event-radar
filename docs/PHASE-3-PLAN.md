# Event Radar — Phase 3: Trust & Polish

**日期:** 2026-03-22
**基于:** Alex's Review (B-), 前两天所有 QA + Review 发现
**目标:** B- → A- | 让 Alex 愿意付 $29/月

---

## Alex 的 5 个 Trust Killers（必须全修）

| # | 问题 | Alex 原话 | 影响 |
|---|------|----------|------|
| TK1 | Watchlist 幽灵 ticker | "13 tickers but I only added 4" | 个性化承诺崩塌 |
| TK2 | 财报数据错误 | "META Q3 -84.3% miss? That didn't happen" | 数据信任崩塌 |
| TK3 | 搜索不可靠 | "earnings returned zero results" | 核心功能不可用 |
| TK4 | Evidence tab 空 | "ghost town" | 深度分析承诺崩塌 |
| TK5 | WebSocket 掉线 | "Offline during casual browse" | 实时承诺崩塌 |

---

## Phase 3 Sprint 计划

### 🔴 Sprint 11: 数据信任修复（1-2 天）
> 如果数据是错的，什么都不值钱

**11.1 审计并修复财报 backfill 数据**
- 问题: META Q3 2025 显示 EPS $1.05 vs $6.71 (-84.3% miss) — 明显错误
- 原因: yfinance earnings_history 的 quarter index 跟 earnings_dates 对不上，EPS estimate 拿错了季度
- 修复: 重新验证所有 43 个 ticker 的 4 个季度数据，跟 Yahoo Finance 页面对比
- 错误的直接删除重新插入

**11.2 修复 Watchlist 幽灵 ticker**
- 问题: onboarding 选了 4 个 ticker，但 watchlist 显示 13 个（MUR, CING, SWMR 等从未添加的）
- 原因: 可能是 default userId 共享了其他 session 的 watchlist 数据
- 修复: onboarding 完成时清理非用户选择的 ticker，或给新 session 一个干净的 userId

**11.3 Onboarding Quick Add 按钮修复**
- 问题: AAPL, TSLA, NVDA 等 popular ticker 按钮全部 disabled
- 原因: 可能是这些 ticker 已在幽灵 watchlist 里，所以 disabled
- 修复: 跟 11.2 一起修 — 清理后按钮应该恢复

**验收:** Alex 重新 onboarding → 只看到自己选的 ticker，无幽灵数据，财报数据正确

---

### 🟠 Sprint 12: 搜索 + 连接稳定性（1-2 天）
> 搜索和实时连接是 Alex 每天用的两个核心功能

**12.1 搜索可靠性修复**
- 问题 1: "earnings" 返回 0 结果 — 但 DB 里有 172 个 earnings 事件
- 原因: `/api/events/search` 的全文搜索可能只搜 title/summary 的 tsvector，但 earnings 事件的标题格式是 "AAPL Q4 2025 Earnings: Beat..."，搜索 query 可能大小写或 tsquery 解析问题
- 修复: 确认搜索 index 覆盖正确的字段 + 测试常见查询
- 问题 2: "tariff" 第一次无结果，第二次有 — debounce/timing 问题
- 修复: 检查前端搜索 debounce 逻辑

**12.2 WebSocket 连接稳定性**
- 问题: 30 分钟内多次 Connected → Reconnecting → Offline 切换
- 原因: dev 环境 Vite proxy WS 不稳定，或 backend WS 有 idle timeout
- 修复: 增加 WS heartbeat/ping-pong，backoff 已有但 reconnect 逻辑可能有 bug

**验收:** 搜索 "earnings"、"tariff"、"Iran" 全部首次返回结果；WS 连接 30 分钟内不掉线

---

### 🟡 Sprint 13: 内容填充（2-3 天）
> 空页面 = 不值 $29

**13.1 Evidence tab 内容填充**
- 问题: Evidence tab 完全空白
- 原因: Event Detail 的 tab 重构（Sprint 4）可能没正确分配内容到 Evidence
- 修复: Evidence tab 应显示 Market Context + Source Details + Risk Factors
- 如果 LLM enrichment 没提供这些数据，至少显示原始来源信息

**13.2 Outcome tracking 覆盖率提升**
- 问题: 22,410 events 只有 70 outcomes (0.3%)
- 原因: Sprint 6 修了 LLM enrichment ticker 回填，但大部分历史事件仍然没有 outcome
- 修复: 跑一次大规模 outcome backfill — 对所有有 ticker 的 delivered 事件补充 outcome data
- 目标: 从 70 → 2000+ outcomes

**13.3 Direction 标签校准**
- 问题: Iran 军事威胁标为 NEUTRAL，应该是 BEARISH
- 修复: 对 truth-social 源的地缘政治事件，LLM prompt 已有规则但可能没生效

**验收:** Evidence tab 有内容；Outcome 覆盖率 > 5%；地缘事件 direction 正确

---

### 🟢 Sprint 14: UX 收尾（1-2 天）
> 最后的打磨让 B- → A-

**14.1 Notification Settings 修复**
- 问题: "Could not load notification channel settings" 错误，Save 按钮 disabled
- 原因: Sprint 8 的 notification settings API 可能因 auth 问题加载失败
- 修复: 确认 API 在 AUTH_REQUIRED=false 时正常工作

**14.2 Watchlist 页面 per-ticker 统计**
- Alex 要求: "Show me per-ticker event counts: NVDA: 1 event, AAPL: 0, TSLA: 0"
- 修复: Watchlist 页面每个 ticker 旁显示最近 7 天的事件计数

**14.3 Feed 事件去重**
- 问题: StockTwits trending 连续 4 条几乎相同的事件
- 修复: 前端侧对同 source + 同 ticker 的事件在 24h 内只显示最新一条

**验收:** 通知可保存；每个 ticker 有事件计数；无重复事件

---

## 时间线

| Sprint | 内容 | 预估 | 优先级 |
|--------|------|------|--------|
| **S11** | 数据信任（财报验证 + 幽灵 ticker + onboarding） | 1-2 天 | 🔴 最高 |
| **S12** | 搜索 + WS 稳定性 | 1-2 天 | 🟠 高 |
| **S13** | Evidence 内容 + Outcome 覆盖 + Direction | 2-3 天 | 🟡 中 |
| **S14** | 通知 + Watchlist 统计 + 去重 | 1-2 天 | 🟢 收尾 |
| **总计** | | **~1 周** | |

---

## 成功标准

Alex 再做一次 review 时：
- ✅ Watchlist 只有他自己选的 ticker
- ✅ META 财报数据正确
- ✅ 搜索 "earnings" 首次返回结果
- ✅ Evidence tab 有内容
- ✅ WS 30 分钟不掉线
- ✅ 通知可配置
- ✅ **Grade: A-** | **NPS: 8+** | **"I'd recommend this to my trading buddy"**
