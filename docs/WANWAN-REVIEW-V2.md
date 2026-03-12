# 晚晚的 V2 Spec 自审 — 实施视角

> 从"实际写代码、花钱调 API"的角度，逐条检查 spec 的可行性。

---

## 🔴 必须改的问题

### 1. `market_cap_b` 历史数据获取不了

**问题：** yfinance `.info['marketCap']` 只返回当前市值。历史市值 = 历史价格 × 当时的流通股数，但流通股数会因 buyback、增发、split 变化。yfinance 的 `quarterly_financials` 有 shares outstanding 但不是所有 ticker 都有，且只有季度频率。

**影响：** `market_cap_tier` 用于相似事件匹配，如果大量 bootstrap 事件的 market_cap_b 是 NULL，匹配质量下降。

**解决：**
- 方案 A：用事件日价格 × 最近一个季度的 shares outstanding（yfinance `quarterly_balance_sheet` 有 `Share Issued`）。精度不完美但够用。
- 方案 B：对于 watchlist 里的 50 个大公司，手动/半自动建一个 shares outstanding 时间序列。大公司的 share count 变化不大（除了大 buyback 或 split）。
- **选择方案 A，标记为 `pit_tier = 'estimated'`。**

### 2. `consecutive_beats` 有顺序依赖

**问题：** 要知道"NVDA 在 2024 Q3 时已经连续 beat 了 7 个季度"，必须先按时间顺序加载所有 earnings 事件，逐个累计计算。

**影响：** Bootstrap 时不能随机顺序插入 earnings 事件，必须先全部发现 → 排序 → 再逐个计算 streak。

**解决：**
- Bootstrap 流程改为两步：
  1. 先加载所有 earnings 事件（日期+beat/miss），不填 `consecutive_beats`
  2. 排序后批量回填 streak 计数
- 在 spec 里加一个 "bootstrap ordering dependencies" 小节。

### 3. `event_returns` 双 benchmark 的存储方式矛盾

**问题：** UNIQUE 约束是 `(event_id, company_id, benchmark_ticker, calc_version)`。如果要存 SPY 和 SOXX 两个 benchmark，需要两行。但两行会有重复的 raw return（return_t0 到 return_t60 完全相同）。

**解决：**
- 去掉 `benchmark_ticker` 从 UNIQUE 约束
- 改为一行存一个事件，包含：
  - raw returns（只有一套）
  - primary benchmark (SPY) returns + alpha
  - sector benchmark returns + alpha（已有 `sector_benchmark` + `sector_alpha_t5/t20`）
- UNIQUE 改为 `(event_id, company_id, calc_version)`
- 这样更紧凑，查询也更简单（不用 WHERE benchmark_ticker = 'SPY'）

### 4. `event_type_patterns` 的 UNIQUE 约束 NULL 问题

**问题：** PostgreSQL 的 UNIQUE 约束中，NULL ≠ NULL。所以 `(layoff, NULL, Technology, NULL, NULL)` 可以插入多次。

**解决：**
- 用 `COALESCE` 把 NULL 替换为 sentinel 值：`COALESCE(event_subtype, '__ALL__')`
- 或者创建一个 unique index with COALESCE 表达式
- 推荐：`CREATE UNIQUE INDEX idx_etp_unique ON event_type_patterns(event_type, COALESCE(event_subtype, ''), COALESCE(sector, ''), COALESCE(market_cap_tier, ''), COALESCE(market_regime, ''), calc_version)`

---

## 🟡 需要细化但不阻塞的问题

### 5. Polygon.io 免费 tier 限制

**实际情况：** 5 calls/min = 300 calls/hour = 7,200 calls/day。
- 50 tickers × (news search per year × 6 years) = 300 个 news 查询
- 每个查询可能分页 → 估算 600-1000 个 API calls
- **约 2-3 小时可完成**，可行但需要 rate limiter + 断点续传

**加入 spec：** Bootstrap 脚本必须支持 resume-from-checkpoint，不要从头重跑。

### 6. VIX Percentile 需要完整历史

**问题：** `vix_percentile_1y` 需要每个事件日期的 trailing 252 个 VIX 数据点。

**解决：** 在 bootstrap 开始前，先下载 2019-2026 的完整 VIX 日数据（FRED `VIXCLS` 或 yfinance `^VIX`）到本地，算百分位时直接查本地数据。约 1,800 个数据点，很小。

### 7. `days_to_next_fomc` / `days_from_last_fomc` 需要 FOMC 日历

**问题：** 不是从 API 直接拿的，需要一份 FOMC 会议日期表。

**解决：** Fed 官网有完整的历史+未来 FOMC 日期，做一个 JSON 文件存到项目里就行。约 50 个日期（2020-2026，每年 8 次）。

### 8. `ref_price` 在 pre-market 事件的定义

**问题：** 如果事件在 6:00 AM pre-market 发布，`ref_price = prev_close` 是合理的。但如果 pre-market 已经有大量交易（比如 NVDA earnings 盘后发布，第二天 pre-market 已经 gap up 20%），`return_t0 = event_day_close / prev_close - 1` 包含了 pre-market 的 gap。

**这其实是正确的** — 对于日级别分析，ref_price = prev_close 是标准做法。gap 本身就是事件反应的一部分。如果以后要做 intraday 分析，可以加 `return_gap`（open/prev_close - 1）和 `return_intraday`（close/open - 1）字段。

**暂不改，但在 spec 里加注释说明。**

### 9. Stock splits 对价格历史的影响

**问题：** yfinance 默认返回 split-adjusted 价格。TSLA 在 2022-08-25 做了 3:1 split，split 前的 raw price 约 $900，adjusted 后显示为 $300。

**影响：** 如果我们存 `price_at_event = $300`（adjusted），但文本描述里说"TSLA was trading at $900"，会产生矛盾。

**解决：** 
- return 计算用 adjusted price（比率不变，正确）
- `price_at_event` 存 adjusted price 并加注释
- 描述文本中可以提到 split 前价格，但分析只用 adjusted
- 在 `event_stock_context` 加一个 `split_adjusted BOOLEAN DEFAULT TRUE` 标记

### 10. 事件去重

**问题：** 同一个事件（META layoff）可能被 SEC 8-K、Reuters、CNBC 分别发现。它们应该是 ONE event + THREE sources，不是 THREE events。

**已有方案：** `event_sources` 表解决了这个问题——一个 `historical_events` 记录可以有多个 `event_sources`。

**补充：** 去重逻辑需要定义清楚：
- 同一 ticker + 同一天 + 相似 event_type → 大概率是同一事件
- 需要一个 dedup score 或者人工 review 标记

---

## ✅ 确认没问题的部分

1. **Security master 设计** — `companies` + `security_identifiers` 带有效期，完美处理 FB→META。
2. **event_entities 多对多** — 正确处理 M&A 的 acquirer/target 关系。
3. **Timestamp verification 流程** — SEC EDGAR > wire > news API > LLM，优先级清晰。
4. **PIT 标记系统** — `pit_tier` + `non_pit_fields` 明确标出了哪些字段不可靠，避免了 look-ahead bias。
5. **AI analysis 版本化** — `version` + `model_used` + `generated_at`，可以随模型升级重新生成。
6. **Typed metric 表** — 比 JSONB 好查，同时有 `metrics_other` 兜底。
7. **Reference price rules** — 明确了每种事件时间的 ref_price 取法。
8. **Sector benchmark mapping** — SOXX for semis, XBI for biotech，比 SPY-only 准确得多。

---

## 💰 成本重新估算

### API 调用成本

| 资源 | 调用量 | 成本 |
|------|--------|------|
| SEC EDGAR | ~500 queries (50 tickers × ~10 filing types) | 免费 |
| Polygon.io news | ~1,000 calls (50 tickers × 6 years, paginated) | 免费 |
| yfinance prices | ~100 calls (50 tickers × batch download) | 免费 |
| FRED macro data | ~50 calls (10 indicators × 5 date ranges) | 免费 |
| Claude event classification | ~2,000 events × ~2K tokens input | ~$12 |
| Claude causal analysis | ~2,000 events × ~4K tokens input/output | ~$36 |
| **Total API cost** | | **~$50** |

### 工程时间成本（更重要）

| 任务 | 估时 |
|------|------|
| 写 bootstrap pipeline（SEC EDGAR parser + Polygon adapter + yfinance adapter） | 3-5 天 |
| 写 price/macro enrichment 脚本 | 1-2 天 |
| 写 Claude analysis 批量处理 | 1-2 天 |
| 数据验证 + 清洗 + dedup | 2-3 天 |
| Schema migration + Drizzle models | 1 天 |
| **Total** | **~10-15 天工程量** |

Codex 说得对：API 费用不贵，工程成本才是大头。

---

## 📋 对 Spec 的修改建议汇总

1. ✏️ `event_returns` UNIQUE 约束改为 `(event_id, company_id, calc_version)`，去掉 benchmark_ticker
2. ✏️ `event_type_patterns` UNIQUE 用 COALESCE 处理 NULL
3. ✏️ 加 `split_adjusted BOOLEAN DEFAULT TRUE` 到 `event_stock_context`
4. ✏️ 加 "Bootstrap Ordering Dependencies" 小节（earnings streak 必须顺序计算）
5. ✏️ 加 "Resume-from-Checkpoint" 要求到 bootstrap 脚本设计
6. ✏️ 加 FOMC 日历 JSON 文件到项目资源
7. ✏️ 加 VIX 完整历史预下载步骤
8. ✏️ 加 ref_price 和 gap/intraday return 的详细说明
9. ✏️ 加 event dedup 规则定义
10. ✏️ market_cap_b 的计算方法说明（price × shares outstanding, estimated）
