# AI Observability System — 实施计划

## Status: ACTIVE
## Date: 2026-03-14
## 基于: RFC + CC/Codex 双重 Review 修正

---

## 📋 总览

将 Event Radar 从"能跑"升级到"能看、能学、能自进化"。
三层 Observability + 自动 Outcome 追踪 + 信号验证闭环。

### 核心原则（来自 Review）
1. **一次调用 = 完整态势感知** — 不要拼 20 个 SQL
2. **决策导向，不是展示导向** — 每个数据点必须能指向一个 action
3. **趋势 > 快照** — "filter rate 从 60% 涨到 75%" 比 "filter rate 75%" 有用
4. **异常驱动** — 正常时沉默，异常时主动推
5. **AI 消费的 JSON** — 结构化、有 sample size、有 completeness metadata
6. **复用现有代码** — dashboard.ts/judge.ts 的 helper 提取出来共享

---

## Phase 0: Prerequisites（基础设施修复）

> 🎯 不做这些，后面全是空中楼阁

### 0.1 启动 Outcome Backfill（P0 Critical）
- **问题**: `processOutcomes()` 从来没被调用，4912 条 event_outcomes 全部 change_1d/1w/1m = NULL
- **修复**: app.ts 加 setInterval，每 15 分钟调用 `outcomeTracker.processOutcomes()`
- **启动延迟**: 进程启动后 2 分钟再开始（避开 grace period）
- **回填速度**: 每次 50 条/interval × 4 个 time bucket = 最多 200 条/15分钟
- **预计**: 完整回填需要约 6 小时（4912 ÷ 200 × 15min），Yahoo Finance API 友好节奏

### 0.2 pipeline_audit 加 confidence 列（P0）
- **问题**: Judge confidence 只嵌在 reason 字符串里（"LLM: ... (confidence: 0.52)"），查询需要 regex
- **修复**:
  - schema.ts: 加 `confidence: decimal('confidence', { precision: 5, scale: 4 })`
  - audit-log.ts: AuditRecord 加 `confidence?: number`，INSERT 加 confidence 字段
  - app.ts: 写 audit 时传入 confidence 值
  - SQL migration: ALTER TABLE + 从现有 reason 回填
- **Review 共识**: CC + Codex 都强烈建议做这个

### 0.3 数据库索引（P1）
- **问题**: 现有索引只有单列（created_at, source, outcome, ticker），observability 查询需要复合索引
- **新索引**:
  - `pipeline_audit(outcome, created_at DESC)` — funnel 聚合
  - `pipeline_audit(source, created_at DESC)` — scanner breakdown
  - `pipeline_audit(stopped_at, created_at DESC)` — stage 分析
  - `pipeline_audit(created_at DESC) WHERE outcome='filtered' AND stopped_at='llm_judge'` — questionable blocks
  - `events(source, source_event_id)` — JOIN 加速（目前完全无索引！）
  - `event_outcomes(event_time) WHERE price_1d IS NULL` — backfill 查询
  - `event_outcomes(event_time) WHERE price_1w IS NULL`

### 0.4 LLM Enrichment Metrics（P2）
- **问题**: 没有 enrichment 成功率/延迟的 Prometheus counter
- **修复**: metrics.ts 加 `llm_enrichment_total` counter + `llm_enrichment_duration_seconds` histogram
- **Instrument**: app.ts 的 enrichment 调用包装计时

### 0.5 提取共享 Query Helpers（P1）
- **问题**: dashboard.ts 和 judge.ts 有大量可复用的 helper（parseMetrics, parseConfidence, asRecord 等）
- **修复**: 提取到 `packages/backend/src/services/query-helpers.ts`
- **Codex Review 明确指出**: judge parsing 代码不要重写，提取复用

### 0.6 RFC 修正（P1）
- `change_1d` 阈值: `> 0.03` → `> 3`（存的是百分比，不是小数）
- `signalStrength` enum 加 `'negative'`（算法有但 schema 漏了）
- trend 从 string 改成结构化: `{ previous, current, delta, deltaPercent, direction }`
- 所有统计值旁边加 `sampleSize`
- 加 `meta.dataCompleteness` 和 `meta.metricsUptimeSeconds`

**Phase 0 产物**: 1 个 PR（branch `fix/observability-prereqs`），包含所有修改

---

## Phase 1: System Pulse API

> 🎯 让晚晚每次 heartbeat 一个 API call 就全知全觉

### Endpoint: `GET /api/v1/ai/pulse?window=30m`

### 1.1 Health Score + Anomaly Detection
- **health.score**: 0-100 综合健康分
- **health.status**: healthy / degraded / unhealthy
- **health.alerts**: 结构化 alerts（code + severity + message + actual/threshold）
- **anomalies**: volume_spike, scanner_silent, filter_rate_change, judge_confidence_drop, delivery_error_spike

### 1.2 Scanner Status
- **scanners**: Array<{ name, eventsInWindow, lastSeenAt, status }>（不用 Record，用 Array）
- **silence 检测**: 基于过去 7 天每 scanner 的平均间隔 × 3
- **市场关闭时段**: 不对市场相关 scanner 报 silent

### 1.3 Pipeline Funnel
- **数据源**: SQL 查 pipeline_audit（不用 Prometheus counter，重启后计数器会归零）
- **trend**: 结构化 `{ previous, current, delta, deltaPercent, direction }`
- **conversionRate**: delivered / ingested

### 1.4 Judge Analysis
- **passRate + avgConfidence**: 从 confidence 列直接查（不再 regex）
- **topBlockReasons**: GROUP BY reason_category
- **questionableBlocks**: confidence < 0.7 且 severity IN ('HIGH','CRITICAL') 的 filtered 事件

### 1.5 Enrichment Stats
- **llmSuccessRate / llmAvgLatencyMs**: 从新的 Prometheus counter 读
- **metricsWindowReliable**: uptime < window 时标记 false

### 1.6 Meta Block
```typescript
meta: {
  dbAvailable: boolean;
  metricsAvailable: boolean;
  metricsUptimeSeconds: number;
  dataCompleteness: 'full' | 'partial' | 'insufficient';
}
```

**Phase 1 产物**: `packages/backend/src/routes/ai-observability.ts` + 对应测试
**估算**: ~800 行代码 + ~400 行测试
**依赖**: Phase 0 全部完成

---

## Phase 2: Daily Intelligence Report

> 🎯 每天一份 AI 运营日报 — 信号验证 + 假阴性检测 + 优化建议

### Endpoint: `GET /api/v1/ai/daily-report?date=YYYY-MM-DD`

### 2.1 Summary + Scanner Breakdown
- 全天事件数、delivery 数、conversion rate
- 对比昨天 + 上周平均（结构化 delta）
- 每 scanner 的 events / delivered / delivery rate / avg severity / status

### 2.2 Judge Analysis + False Negative Detection
- **falseNegativeCandidates**: 被 judge 拦截但实际涨跌 > 3% 的事件
  - JOIN 路径: `pipeline_audit → events (ON source_event_id + source) → event_outcomes`
  - ⚠️ 必须用 `e.source = pa.source` 双条件 JOIN（Codex Review 指出）
  - 阈值: `ABS(eo.change_1d) > 3`（百分比数值）
  - verdict: `likely_false_negative` / `correctly_blocked`（enum 不是 string）
- **confidenceDistribution**: high(>0.8) / medium(0.5-0.8) / low(<0.5)

### 2.3 Signal Validation
- 对比 delivered vs filtered 事件的实际价格影响
- **signalStrength**: strong (≥2x) / moderate (≥1.5x) / weak (≥1x) / negative (<1x) / insufficient_data
- **CC Review 指出**: 要按 severity bucket 分开比较，避免 selection bias
  - HIGH delivered vs HIGH filtered, MEDIUM vs MEDIUM 等
- 除零保护: filtered avg 为 0/null 时返回 insufficient_data

### 2.4 Outcome Tracker Health
- eventsWithFullPriceData / eventsPending1d / eventsPending1w / eventsPending1m
- backfillHealth: healthy / stale / not_running（基于最近一次 outcome 更新时间）

### 2.5 Recommendation Engine
| 条件 | 建议 | 优先级 |
|------|------|--------|
| ≥3 false negatives with >5% move | lower_judge_threshold | high |
| Scanner dead >24h | investigate_scanner | high |
| Filter rate >70% (vs 7日均) | review_filter_rules | medium |
| Dedup rate >50% for one scanner | tune_dedup_window | medium |
| Historical match rate <5% | expand_historical_data | medium |
| Outcome backfill stale >24h | fix_outcome_tracker | high |
| Signal strength "negative" | review_classification | high |
| classification_outcomes empty >30d | populate_classification_outcomes | low |
| user_feedback empty | enable_feedback_collection | low |
| Same ticker 5+/day all filtered | review_ticker_filter | medium |
| Delivery success <95% | investigate_channel | high |

### 2.6 Cron Integration
- 每天 UTC 01:00 (ET 9pm) 生成日报
- 发到 #event-radar-project
- 格式化为 Discord embed（关键指标 + 建议 + false negatives）

**Phase 2 产物**: `packages/backend/src/services/signal-validator.ts` + `recommendation-engine.ts` + 路由扩展
**估算**: ~600 行代码 + ~300 行测试
**依赖**: Phase 0 + Phase 1 + outcome backfill 运行 ≥ 3 天

---

## Phase 3: Deep Diagnostics

> 🎯 出问题了能秒查 — 事件追踪 + Scanner 深潜

### 3.1 Event Trace: `GET /api/v1/ai/trace/:eventId`
- 单事件全生命周期: ingested → classified → dedup_check → judge → enriched → delivered/blocked
- **已知限制**: pipeline_audit 只写一条终态行，没有 stage-by-stage 时间戳
  - 解决: 从 events.metadata, classification_predictions, event_outcomes 拼装 timeline
  - 实际能展示的阶段: stored_at(events), classified_at(predictions), audit(pipeline_audit), outcome
- 包含: classification detail, judge decision, enrichment summary, delivery channels, price outcome

### 3.2 Scanner Deep Dive: `GET /api/v1/ai/scanner/:name?days=7`
- 总量 / delivery rate / dedup rate / avg severity
- **timeline**: 用 daily buckets (7d), 只在 `days=1` 时用 hourly buckets
- topTickers: 按 scanner 的 ticker 频率排序
- vsPrevPeriod: 对比前一个同等长度 period

### 3.3 Period Comparison — DEFERRED
- CC Review 建议 defer 到 Phase 4
- Daily report 的 vsYesterday + vsPrevWeekAvg 已覆盖 80%
- 如果主人需要再加

**Phase 3 产物**: 路由扩展 + trace/scanner service
**估算**: ~400 行代码 + ~200 行测试
**依赖**: Phase 1

---

## Phase 4: 自动化集成 + 演进

> 🎯 把 Observability 接入日常运维流程

### 4.1 Heartbeat 集成
- HEARTBEAT.md 加入: 每 4 小时 call `/ai/pulse`
- 异常 → 自动 notify #event-radar-project
- 健康分 < 80 → 自动调查 + 通知

### 4.2 Critical Anomaly Push（CC Review P2 建议）
- 不等 heartbeat poll — critical anomaly 实时推 Discord
- 用 EventBus 挂钩: scanner_silent > 6h / delivery 连续失败 → 立即 webhook
- 实现为 lightweight post-anomaly hook，不是新 phase

### 4.3 Classification Outcomes 填充
- 目前 `classification_outcomes` 表空的 — 无法衡量分类准确度
- 需要把 event_outcomes 的实际涨跌反馈到 classification 系统
- 这是"系统自学习"的第一步

### 4.4 User Feedback Loop
- user_feedback 表已有 schema 但无收集机制
- Discord reaction / 按钮 → 收集用户对 alert 的反馈
- 与 falseNegative + signal validation 结合

---

## 实施顺序 & 时间估算

| Phase | 内容 | 估算 | 前置 |
|-------|------|------|------|
| **0** | Prerequisites | ~400 行, 1 PR | 无 |
| **1** | Pulse API | ~800 行, 1 PR | Phase 0 |
| **2** | Daily Report | ~600 行, 1 PR | Phase 0+1 + 3天 backfill |
| **3** | Deep Diagnostics | ~400 行, 1 PR | Phase 1 |
| **4** | 自动化 + 演进 | ~300 行 | Phase 1+2+3 |

**总计**: ~2500 行代码 + ~1200 行测试

---

## 关键修正（来自 Review）

| 原 RFC | 修正 | 来源 |
|--------|------|------|
| `ABS(change_1d) > 0.03` | `> 3` | Codex — change_1d 存百分比 |
| `scanners: Record<string, ...>` | `Array<{name, ...}>` | Codex — 更易排序和验证 |
| `trend: 'increasing'` | `trend: { previous, current, delta, ... }` | Codex — 结构化 |
| 无 sample size | 所有统计值加 sampleSize | Codex |
| 无 meta block | 加 dataCompleteness + metricsUptimeSeconds | Codex |
| Pulse 含 outcomeTracker | 移到 Daily Report | CC — 批量数据不属于实时 pulse |
| 含 Period Comparison | defer 到 Phase 4 | CC — 过度工程 |
| reason regex 解析 confidence | 新 confidence 列 | CC + Codex 共识 |
| SQL-only Phase 1 | SQL + Prometheus 混合 | Codex — 有些数据只在内存 |
| 单条件 JOIN | `e.source_event_id = pa.event_id AND e.source = pa.source` | Codex — 防碰撞 |
| 无市场关闭考虑 | scanner silence 需考虑交易时段 | Codex |
| 无端到端延迟 | 加 p50/p95 event latency | CC |
| 无 LLM 成本追踪 | Phase 4 考虑 | CC |
| falseNegative verdict 是 string | 改成 enum | Codex |

---

## Open Questions（待主人定）

1. **Critical anomaly push**: scanner 挂 6h+ 要不要立即推 Discord，还是等 heartbeat？
2. **日报发送时间**: UTC 01:00 (北京 09:00) 可以吗？
3. **Phase 4 的 user feedback**: 用 Discord reaction 还是按钮？
4. **Scanner baseline**: 用过去 7 天数据自动计算，新 scanner 用默认值 — OK?
