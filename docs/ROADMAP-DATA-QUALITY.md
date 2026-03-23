# Event Radar — Data Quality Roadmap

**Date:** 2026-03-23
**Goal:** Data quality from 2/10 → 7+/10
**Timeline:** 2 weeks

---

## Phase DQ-1: Clean the Water (Today)
> 一天搞定，立竿见影

| # | Task | Impact | Effort | Owner |
|---|------|--------|--------|-------|
| 1 | StockTwits 9123 MEDIUM → LOW (migration) | ⭐⭐⭐⭐⭐ | 5 min | Codex ✅ (PR #205) |
| 2 | Trading halt 316 MEDIUM → HIGH (migration) | ⭐⭐⭐⭐ | 5 min | Codex ✅ (PR #205) |
| 3 | Smart Feed 隐藏 LOW 事件 | ⭐⭐⭐⭐⭐ | 1 hour | Codex ✅ (PR #205) |
| 4 | Feed 质量指示器 "5 important events" | ⭐⭐⭐ | 1 hour | Codex ✅ (PR #205) |
| 5 | 确认 BLOCKED 事件不在 feed 里 | ⭐⭐⭐ | 30 min | Codex ✅ (PR #205) |
| 6 | About email placeholder → hello@eventradar.app | ⭐⭐ | 1 min | Codex ✅ (PR #204) |

**预期效果:** Feed 从 76% 噪音 → 高质量事件为主。MEDIUM 占比 88% → ~50%。

---

## Phase DQ-2: Enable High-Value Scanners (Day 2-3)
> 开启已建好但关着的 scanner

| # | Scanner | How | Value | Status |
|---|---------|-----|-------|--------|
| 1 | **halt-scanner** | `HALT_SCANNER_ENABLED=true` | 10/10 | 交易停牌，秒级时效 |
| 2 | **earnings-scanner** | 需要 Alpha Vantage API key | 9/10 | 财报是最大的市场事件 |
| 3 | **newswire-scanner** | 已在跑，调噪音过滤 | 7/10 | 公司公告直接来源 |
| 4 | **dilution-scanner** | 已在跑，确认 severity | 7/10 | 稀释信号，高度 bearish |
| 5 | **sec-edgar** | 已在跑 (9.4k events) | 8/10 | 内部交易、8-K |

**环境变量改动：**
```bash
HALT_SCANNER_ENABLED=true
EARNINGS_SCANNER_ENABLED=true
DILUTION_SCANNER_ENABLED=true
```

**预期效果:** 事件来源从 3 个主力 → 6+。高质量 HIGH/CRITICAL 事件数量翻倍。

---

## Phase DQ-3: Fix Classification Pipeline (Day 3-5)
> 让 AI 分类器不再是橡皮图章

| # | Task | File | Impact |
|---|------|------|--------|
| 1 | **Severity 校准** — 加 few-shot examples 到分类 prompt | `classification-prompt.ts` | LLM 不再默认 MEDIUM |
| 2 | **Confidence 校准** — 要求 LLM 用全范围 0.3-0.95 | `classification-prompt.ts` | 区分高信心 vs 低信心 |
| 3 | **去掉方向预测** — 1.85% 准确率不如不预测 | `classification-prompt.ts` | 去掉误导信息 |
| 4 | **Ticker 提取** — 公司名→ticker 映射 (top 200) | `ticker-extractor.ts` | 49% null ticker → ~20% |
| 5 | **SEC 8-K Item 8.01** → LOW（"Other Events" 是垃圾桶）| `default-rules.ts` | 减少噪音 |
| 6 | **Rule engine 高置信时跳过 LLM** | `event-pipeline.ts` | 减少延迟 + API 成本 |

**预期效果:** 
- MEDIUM 占比 50% → 30%
- Null ticker 49% → 20%
- 方向预测从误导 → 诚实的 "N/A"

---

## Phase DQ-4: Outcome Tracking + Scorecard (Day 5-7)
> 让 Scorecard 有真实数据支撑

| # | Task | Impact |
|---|------|--------|
| 1 | **扩展 outcome 追踪** — 不只是 trading halt，所有有 ticker 的事件都追踪 | 覆盖率 0.88% → 30%+ |
| 2 | **Delivery gate enforce 模式** | 只推送高质量事件 |
| 3 | **Rolling accuracy API** — 替换 Scorecard "Coming soon" | 用户可见准确率趋势 |
| 4 | **只展示 n≥50 的准确率** | 统计显著性 |
| 5 | **Reframe Scorecard** — 先展示 "事件发现量" 再展示准确率 | 正面引导 |

**预期效果:** Scorecard 从 "36% 准确率（比掷硬币还差）" → 有意义的追踪数据

---

## Phase DQ-5: Killer Features (Week 2)
> 从 "有用" 到 "不可缺少"

| # | Feature | Why | Effort |
|---|---------|-----|--------|
| 1 | **"Why Is It Moving" (WIIM)** | 监控 top 500 股票异动 → 关联已检测事件 | 3-5 days |
| 2 | **Daily Market Briefing** | AI 早报 "3 条重要事件，今日关注" → 7am 推送 | 2-3 days |
| 3 | **价格上下文** | 事件卡片显示当前价格 + 日涨跌 | 1-2 days |
| 4 | **多源确认** | 同一事件多个来源 → 信心加倍 | 2-3 days |

---

## 成功标准

| Phase | 完成后得分 | Timeline |
|-------|----------|----------|
| DQ-1 | 2 → 4/10 | 今天 |
| DQ-2 | 4 → 5/10 | +2 天 |
| DQ-3 | 5 → 6/10 | +3 天 |
| DQ-4 | 6 → 7/10 | +2 天 |
| DQ-5 | 7 → 8/10 | +5 天 |

**2 周后目标:** 数据质量 7-8/10，产品整体值 $29/月。

---

## 不做的事
- ❌ Congressional Trading Dashboard（需要 CapitolTrades API，已 404）
- ❌ Options Flow（需要 Unusual Whales $48/月）
- ❌ Analyst Ratings（需要 Benzinga API）
- ❌ 这些等有收入后再投入
