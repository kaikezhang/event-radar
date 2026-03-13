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

| Scanner | 预计 miss/week | 难度 | 数据源 | 成本 |
|---------|---------------|------|--------|------|
| **SEC EDGAR 8-K/Form 4** | 10-20 | 中 | SEC EDGAR ATOM feed (free, 10 req/s) | $0 |
| **PR Newswire / BusinessWire** | 5-10 | 低 | RSS feeds (public) | $0 |
| **Truth Social (Trump)** | 3-5 | **低** | 公开 profile 轮询（见下方方案） | $0 |

### Tier A（显著提升质量）

| Scanner | 预计 miss/week | 难度 | 数据源 | 成本 |
|---------|---------------|------|--------|------|
| **NYSE/Nasdaq Halt Feed** | 2-5 | 中 | Nasdaq halt API (free) | $0 |
| **X/Twitter Key Figures** | 2-5 | 高 | 需要 X API 或 scraping | $200/月 |
| **Credit Rating Actions** | 1-3 | 低 | Moody's/S&P RSS | $0 |

### Tier B（锦上添花）

| Scanner | 预计 miss/week | 难度 |
|---------|---------------|------|
| Company IR 网站监控 | 2-5 | 中 |
| Exchange halt/LULD | 1-2 | 中 |
| OFAC sanctions | <1 | 低 |
| EIA petroleum | <1 | 低 |

**建议顺序：SEC EDGAR → PR Newswire → Truth Social → NYSE Halt → Company IR**

### Truth Social 低成本方案（决策记录）

原始评估 "难度高"，经研究发现有多条低成本路径：

1. **公开 Profile 轮询（首选）** — Trump 的 profile 公开可见，无需 auth。Truth Social 基于 Mastodon，公开用户有标准 API endpoint。每 30s GET 一次 → 解析新帖 → 完成。成本 $0。
2. **Stanford TruthBrush** — 斯坦福开源的 Python client（Apache 2.0），2025.1 确认仍可用。`pip install truthbrush`。
3. **ProfileTracer.com** — 第三方 webhook 服务，免费试用，适合快速验证。

法律风险评估：**低**。只监控公开页面的公开信息，不爬私有 API，不重新发布原文（只提取关键词生成 alert），等同于用浏览器查看。

**决策：难度从"高"降为"低"，排在 PR Newswire 之后。**

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

## 实施优先级（修订版 — 整合 CC/Codex review + Market Regime）

> 原则：先让系统跑起来（≥1 delivered alert），再搭测量和进化基础设施。

### Phase 1: 让系统跑起来（Week 1）

| # | 任务 | 工作量 | 关键点 |
|---|------|--------|--------|
| 1 | 开启 LLM Enrichment | 1h | 改 .env，验证 ≥1 delivery |
| 2 | SEC EDGAR 8-K RSS scanner | 2-3d | RSS-only v1，不深度解析 HTML。让 LLM Judge 读 filing summary |
| 3 | PR Newswire + BusinessWire RSS | 0.5-1d | 纯 RSS 解析，低难度高收益 |

### Phase 2: 让 Alert 有价值（Week 2）

| # | 任务 | 工作量 | 关键点 |
|---|------|--------|--------|
| 4 | Rich delivery format | 1-2d | AI summary + 历史模式 + regime context |
| 5 | Price Service（历史 batch） | 1-2d | yfinance 日频缓存（v1 够用）；生产用 Polygon/Databento（v2） |
| 6 | Market Regime Service | 1-2d | VIX + RSI + yield curve → regime score → 注入 enrichment |
| 7 | LLM Judge Golden Test Set | 1d | 50 个标注样本，防 model drift |

### Phase 3: 扩展数据源（Week 3-4）

| # | 任务 | 工作量 | 关键点 |
|---|------|--------|--------|
| 8 | Truth Social scanner | 0.5-1d | 公开 profile 轮询，低成本方案 |
| 9 | NYSE/Nasdaq Halt Feed | 1d | 二进制事件，无需分类 |
| 10 | Exchange halt/LULD | 1d | 与 #9 合并 |

### Phase 4: 测量与进化（Month 2+）

| # | 任务 | 工作量 | 关键点 |
|---|------|--------|--------|
| 11 | Post-Market Review（先手动跑 2 周）| 0.5d | SQL + 手动 review，验证概念 |
| 12 | Post-Market Review Bot（自动化）| 5-7d | 确认手动有效后再自动化 |
| 13 | Backtest Framework | 2-3w | 需要先积累 2 周 delivered data；先做 A/B 计数对比，不做时间模拟 |
| 14 | Alert Quality Feedback Loop | 2d | 先 report-only 模式，不自动调参 |
| 15 | Pipeline Clock 接口注入 | 1d | backtest 前提，越早越好 |

### 重要决策记录（来自 CC/Codex review）

- **不删除 rule-based filters** — 保留为 LLM fallback，不是替代
- **Price Service 拆两个** — 历史 batch (yfinance) + 实时 quote (Finnhub/Polygon)
- **自动调参至少 report-only 跑 2 个月** — 防止 feedback loop 振荡
- **"Action" 字段改为信息性表述** — "Historical similar events saw initial dips lasting 1-3 days" 而不是 "Watch for entry"
- **添加 delivered_count 健康检查** — 交易日 24h 内 0 delivery 则告警
- **添加 kill switch** — API endpoint 一键停止所有 delivery
- **yfinance v1 够用，v2 上 Polygon/Databento** — 不急着花 $5-20k/年
- **Market Regime 因子注入 LLM enrichment prompt** — 让 AI 分析考虑市场状态放大效应

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
