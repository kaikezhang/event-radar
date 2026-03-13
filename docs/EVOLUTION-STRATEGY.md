# Event Radar — 根本性优化战略 (Evolution Strategy)

> 核心使命：**最快**把**最有价值**的市场事件推给用户，并给出**有数据支撑**的决策建议。

## 当前状态诊断

### 数据看板（截至 2026-03-13）
- 6,788 events in DB, 0 delivered（filter 挡了所有）
- 活跃 scanner 6 个，禁用 8 个
- Pipeline: 577 filtered, 285 grace_period, 100 deduped, **0 delivered**
- 没有 SEC EDGAR live scanner（只有 1 条手动插入的 sec-edgar 事件）
- 没有 Truth Social / X scanner 在跑
- 没有 PR Newswire / BusinessWire
- 没有 NYSE/Nasdaq halt feeds
- Reddit 持续 403
- LLM enrichment 关闭（`LLM_ENRICHMENT_ENABLED=false`）
- Historical enricher 有 2,400+ 历史事件但从未在 delivered alert 中展示过

### 根本问题

系统的核心矛盾不是"filter 太严"（这个刚修了），而是：

1. **数据源太少且太弱** — 最重要的一手数据源（SEC EDGAR live、PR Newswire、交易所 halt）都没有
2. **没有验证闭环** — 不知道系统是否真的在关键时刻 deliver 了正确的 alert
3. **AI enrichment 是关着的** — 用户看到的 alert 没有 AI 分析，价值大打折扣
4. **不会自我进化** — miss 掉的重要事件没有任何机制被检测和反馈

---

## 战略一：回测框架 — 让每次修改都有数据支撑

### 为什么这是最优先的

引用 Codex review 的话：
> "Backtest the hybrid strategy on the historical corpus before changing production routing."

目前所有 pipeline 修改都是凭直觉。我们有 6,788 个历史事件 + pipeline_audit 记录，但从未用它们验证过任何决策。

### 设计

```
┌────────────────────────────────────────────────┐
│              Backtest Engine                    │
│                                                │
│  Input:                                        │
│  - Historical events from DB (time-ordered)    │
│  - Pipeline config variant (filter params)     │
│  - Market data (from Yahoo Finance / yfinance) │
│                                                │
│  Process:                                      │
│  - Replay events through pipeline (stateful!)  │
│  - For each "delivered" event, fetch:          │
│    - T+30m, T+1h, T+1d, T+5d price            │
│    - Abnormal return vs SPY/sector ETF         │
│                                                │
│  Output:                                       │
│  - Alerts/day (mean, median, p90)              │
│  - Precision (% of alerts with |move| > 3%)    │
│  - Recall (% of big moves we caught)           │
│  - False positive rate by source               │
│  - Duplicate rate                              │
│  - Median alert delay                          │
│                                                │
│  Compare:                                      │
│  - Strategy A vs B vs C                        │
│  - Acceptance bar: precision>70%, recall>80%   │
└────────────────────────────────────────────────┘
```

### 实现路径

1. **`backtest` CLI 命令** — `pnpm backtest --strategy=hybrid-v2 --days=30`
2. **Price fetcher** — 用 yfinance 或 Yahoo Finance API 拉历史价格（缓存到 DB 的 `price_history` 表）
3. **Replay engine** — 按时间顺序重放事件，模拟 dedup/staleness/filter/LLM Judge 的有状态行为
4. **Report generator** — 输出 markdown 报告 + JSON metrics
5. **CI 集成** — 每次 pipeline 变更的 PR 自动跑 backtest，结果贴到 PR comment

### 关键 metric

| Metric | 最低标准 | 目标 |
|--------|---------|------|
| Alerts/day | 3-10 | 5-8 |
| Precision（alert 后真的有 ≥3% move） | >50% | >70% |
| Recall（≥3% move 我们有 alert） | >60% | >80% |
| Duplicate rate | <15% | <5% |
| Median delay（event→alert） | <120s | <60s |

---

## 战略二：自我进化机制 — Miss Detection & Source Discovery

### 核心思想

> 如果某只股票今天涨了 10%，而我们没有发任何 alert，这是一个系统性失败。我们需要自动发现这种失败，找到原始信源，然后改进 scanner。

### 设计：Post-Market Review Bot

```
每天收盘后自动运行：

1. 拉取当天所有 |abnormal return| > 5% 的股票
2. 对比我们当天 delivered 的 alerts
3. 找出 "missed movers" — 大涨/大跌但我们没有 alert 的

对每个 missed mover：
4. 搜索原因（用 LLM + web search）
   - "Why did SMCI drop 15% today?"
   - 找到原始 catalyst（比如 SEC investigation, earnings miss, analyst downgrade）

5. 追溯信源
   - 这个 catalyst 最早出现在哪里？
   - SEC filing? PR Newswire? Reuters? Twitter?
   - 几点钟出来的？

6. 诊断
   - 我们有这个 scanner 吗？→ 如果没有，记录 "missing source"
   - 我们有 scanner 但没收到？→ scanner bug，记录 "scanner failure"
   - 我们收到了但被 filter 拦了？→ filter 误杀，记录 "false negative"
   - 我们收到了但 dedup 了？→ dedup 误杀

7. 生成 "进化报告"
   - Missing sources → 自动创建 GitHub issue "Add scanner: PR Newswire"
   - False negatives → 自动调整 filter 参数建议
   - Scanner failures → 自动创建 bug report
```

### 输出：daily evolution report

```markdown
## 📊 Post-Market Review — 2026-03-13

### Missed Movers (我们没 alert 的大波动)
| Ticker | Move | Catalyst | Source | Our Status |
|--------|------|----------|--------|-----------|
| SMCI | -15% | SEC investigation | Reuters 9:15am | ❌ No scanner for Reuters breaking |
| RIVN | +12% | Partnership with Amazon | PR Newswire 8:30am | ❌ No PR Newswire scanner |
| XYZ | -8% | CEO resigned | 8-K filing 4:05pm | ❌ No SEC EDGAR live scanner |

### Caught (我们成功 alert 的)
| Ticker | Move | Alert Delay | 
|--------|------|-------------|
| TSLA | +5% | 45s | ✅

### Recommendations
1. 🔴 HIGH: Build SEC EDGAR live scanner — missed 3 events this week
2. 🟡 MEDIUM: Add PR Newswire RSS — missed 2 corporate announcements
3. 🟢 LOW: Tune StockTwits threshold down to 30k watchers
```

### 长期效果

这个机制让系统**自动发现盲区**。每天跑一次，每周生成一个 "source priority" 排名。连续多天因为同一个缺失 source miss 掉事件 → 自动提升该 source 的开发优先级。

---

## 战略三：关键缺失 Scanner 优先级

基于 SOURCES.md 的愿景 vs 当前实际，按 **预期每日 miss 数量** 排序：

### Tier S（不做就没法用的）

| Scanner | 预计 miss/week | 难度 | 数据源 |
|---------|---------------|------|--------|
| **SEC EDGAR 8-K/Form 4** | 10-20 | 中 | SEC EDGAR ATOM feed (free, no rate limit on RSS) |
| **PR Newswire / BusinessWire** | 5-10 | 低 | RSS feeds (free, public) |
| **Truth Social (Trump)** | 3-5 | 高 | 需要 scraping 或第三方 API |

### Tier A（显著提升质量）

| Scanner | 预计 miss/week | 难度 | 数据源 |
|---------|---------------|------|--------|
| **NYSE/Nasdaq Halt Feed** | 2-5 | 中 | Nasdaq halt API (free) |
| **X/Twitter Key Figures** | 2-5 | 高 | 需要 X API ($200/月) 或 scraping |
| **Credit Rating Actions** | 1-3 | 低 | Moody's/S&P RSS |

### Tier B（锦上添花）

| Scanner | 预计 miss/week | 难度 |
|---------|---------------|------|
| Exchange halt/LULD | 1-2 | 中 |
| OFAC sanctions | <1 | 低 |
| EIA petroleum | <1 | 低 |

**建议顺序：SEC EDGAR → PR Newswire → Truth Social → NYSE Halt**

---

## 战略四：AI Enrichment 开关 — 从"有数据"到"有洞察"

### 当前状态

- `LLM_ENRICHMENT_ENABLED=false` — AI 分析是关着的
- Historical enricher 有 2,400+ 历史事件但从未在实际 alert 中展示
- 用户看到的 alert 只有标题 + source + severity，没有"so what"

### 为什么要开

Event Radar 的核心价值主张是：

> "SEC files an 8-K at 4:05 PM. CNBC covers it at 6 PM. You had it at 4:05 **with AI analysis and historical context.**"

目前只做到了前半句（速度），但没做到后半句（分析）。

### 开启方案

1. **LLM Enrichment** — 用 GPT-4o-mini 对每个 delivered event 生成：
   - Summary（一句话说什么事）
   - Impact（为什么这很重要）
   - Affected tickers + direction（bullish/bearish）
   - Confidence（LLM 对自己判断的信心）

2. **Historical Pattern** — 对每个 delivered event：
   - 搜索 DB 中相似历史事件
   - 展示平均 T+5/T+20 move
   - 展示 win rate

3. **成本控制**：
   - 只 enrich delivered events（不是所有事件）
   - 每天 3-10 个 delivered × ~1000 tokens = <$0.01/day
   - 完全可以开

### Action

设置 `LLM_ENRICHMENT_ENABLED=true` + 确认 `OPENAI_DIRECT_API_KEY` 配置正确。

---

## 战略五：Market Data Integration — 从定性到定量

### 当前缺失

- 没有实时/历史价格数据
- 没有 volume 数据
- 不知道 alert 发出后股票实际涨了还是跌了
- 无法计算 "abnormal return"
- 无法自动评估 alert 质量

### 设计

```
┌──────────────────────────────────────────┐
│           Price Service                   │
│                                          │
│  - 实时价格: yfinance / Yahoo Finance    │
│  - 历史价格: 缓存到 price_history 表     │
│  - 定期更新: 每 5 min during RTH        │
│                                          │
│  接口:                                   │
│  - getPrice(ticker, timestamp)           │
│  - getReturn(ticker, from, to)           │
│  - getAbnormalReturn(ticker, from, to)   │
│    (vs SPY or sector ETF)                │
└──────────────────────────────────────────┘
```

### 用途

1. **Alert 质量评估** — alert 发出后自动跟踪 T+30m/T+1h/T+1d 价格
2. **Backtest engine** — 需要价格数据来计算 precision/recall
3. **Post-market review** — 需要知道哪些股票大涨大跌
4. **Feed 中显示** — 用户看到 alert 时能看到 "since alert: +3.2%"

---

## 战略六：Alert Quality Feedback Loop

### 当前缺陷

系统是开环的 — 发了 alert 就完事了，不知道：
- 用户觉得有没有用
- 发完后股票到底怎么走了
- 这个 alert 的"投资回报率"是多少

### Feedback 机制

```
Alert Delivered
    │
    ├── T+30m: 自动拉价格，记录 short-term move
    ├── T+1d: 记录 daily move
    ├── T+5d: 记录 weekly move
    │
    └── 每周汇总:
        - 哪些 alert 精准（alert 后确实大涨/大跌）
        - 哪些 alert 是噪音（alert 后没动）
        - 按 source/category/severity 分组分析
        - 自动调整 filter 参数
```

### 自动调参

如果连续 2 周某个 source 的 alert precision < 30%:
- 自动提高该 source 的 LLM Judge confidence threshold
- 或者降低该 source 的 severity
- 记录调参历史供人工 review

---

## 战略七：Delivery 进化 — 从推送到决策辅助

### 当前 delivery 只是"通知"

```
🔴 CRITICAL — NVDA Restructuring Alert
Source: SEC EDGAR · 2min ago
```

### 进化后的 delivery 应该是"决策辅助"

```
🔴 CRITICAL — NVDA — Restructuring Alert
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 NVIDIA filed 8-K: $2.1B restructuring charge, 12% workforce reduction

🤖 AI Analysis:
This is a significant restructuring move. Historically, tech
restructurings of this scale lead to positive stock performance
as investors view cost-cutting favorably.

📊 Historical Pattern (12 similar events):
   T+5:  +8.3% avg | 67% win rate
   T+20: +15.2% avg | 75% win rate
   Best: META 2022 (+32%)
   Worst: INTC 2023 (-8%)

📈 Since alert: NVDA -2.1% (initial dip typical)

⚡ Action: Watch for entry on initial dip.
   Similar events bottomed within 3 trading days.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚖️ AI-generated. Not financial advice.
```

这才是用户愿意付 $15/月的产品。

---

## 实施优先级

| # | 战略 | 预计工作量 | 影响 | 优先级 |
|---|------|-----------|------|--------|
| 1 | 开启 LLM Enrichment | 1h（改 .env） | 🔴 巨大 — 从"通知"变"分析" | **P0** |
| 2 | SEC EDGAR scanner | 2-3d | 🔴 巨大 — 最重要的一手数据源 | **P0** |
| 3 | PR Newswire/BusinessWire RSS | 1d | 🟡 高 — 企业公告核心源 | **P1** |
| 4 | Post-Market Review Bot | 2-3d | 🔴 巨大 — 自我进化引擎 | **P1** |
| 5 | Backtest Framework | 3-5d | 🟡 高 — 数据驱动决策 | **P1** |
| 6 | Price Service | 2d | 🟡 高 — backtest 和 review 的前提 | **P1** |
| 7 | Delivery 进化（rich context） | 1-2d | 🟡 高 — 用户价值翻倍 | **P2** |
| 8 | Alert Quality Feedback Loop | 2d | 🟢 中 — 自动调参 | **P2** |
| 9 | Truth Social scanner | 3-5d | 🟡 高 — 但技术难度大 | **P2** |
| 10 | NYSE Halt Feed | 1d | 🟢 中 | **P3** |

---

## 设计原则

1. **数据驱动** — 任何 pipeline 修改都要先跑 backtest，用数字说话
2. **闭环反馈** — alert → 价格跟踪 → 质量评估 → 参数调整 → 更好的 alert
3. **自我进化** — miss 了大事件 → 自动发现 → 自动建议新 scanner → 人工确认 → 实现
4. **价值导向** — 不是"多多益善"的信息推送，是"精准有用"的决策辅助
5. **渐进式** — 每个改进都可以独立上线，不需要一次性大改

---

*Written by 晚晚 — 2026-03-13*
*Based on deep project review + CC/Codex reviews + 主人指导*
