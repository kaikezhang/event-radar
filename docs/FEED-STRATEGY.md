# Event Radar — Feed 策略 (v2)

## 唯一判断标准

> **这条信息会不会在短时间内引起股市明显波动？**

如果答案是"不会"或"这件事大家早就知道了"，就不推。不管它来自白宫还是 SEC 还是 Reuters。

## 什么是"股市明显波动"

- 某个 sector 或大盘可能变动 1%+
- 某个个股可能变动 3%+
- 会改变市场参与者的短期交易决策

## 值得推的事件（举例）

| 事件 | 为什么值得推 |
|------|------------|
| Trump 宣布对中国加 50% 关税 | 半导体/贸易股立刻大跌 |
| Fed 紧急降息 50bp | 所有资产重新定价 |
| NVDA CEO 辞职（8-K） | 个股暴跌 10%+ |
| 油价突破 $100/桶 | 能源/航空/运输板块大幅波动 |
| CPI 超预期 1%+ | 整个市场重新定价利率路径 |
| 战争爆发/升级 | VIX 飙升，避险资产暴涨 |
| 大型科技公司意外裁员 50%+ | 个股暴跌 |
| FDA 拒绝重磅药物 | 生物股暴跌 30%+ |
| S&P 500 跌破关键支撑位 | 引发程序化卖盘 |

## 不值得推的事件

| 事件 | 为什么不推 |
|------|----------|
| "Why NVDA is sinking today" | 事后分析，不是新信息 |
| Earnings Call Summary | 信息已经在财报公布时反映了 |
| "11 stocks to harden your portfolio" | 投资建议，不是事件 |
| IRS 征集意见表 | 不影响股市 |
| 制冷剂 R-134a 关税初步裁定 | 太小众，不影响大盘或主流股 |
| PODD entered StockTwits trending (9k watchers) | 热度太低，噪音 |
| "Ending Certain Tariff Actions" (重复第3次) | 已经推过了 |
| Sunshine Act Meeting Notice | 行政手续，不影响市场 |

## 新策略：统一 LLM 判断

**删除所有硬编码 filter（keyword filter、retrospective pattern filter）。**

所有事件统一经过一个 LLM Judge：

```
Pipeline: Scanner → Dedup → Staleness → LLM Judge → Enrich → Deliver
```

### LLM Judge Prompt

```
You are a senior market analyst at a trading desk. Your job is to decide 
whether an incoming event would cause notable market movement and is worth 
alerting active traders about.

Event:
- Source: {source}
- Title: {title}
- Body: {body}
- Timestamp: {timestamp}

Decision criteria:
1. NOVELTY: Is this NEW information that the market hasn't priced in yet?
   - If this news was already known hours/days ago, reject it.
   - If this is analysis/commentary on old news, reject it.
   
2. MARKET IMPACT: Would this cause notable price movement?
   - Could move a sector or the broad market 1%+
   - Could move a specific stock 3%+
   - Would change traders' near-term positioning
   
3. ACTIONABILITY: Can a trader act on this information?
   - Breaking events that require attention: YES
   - Retrospective "why X happened" articles: NO
   - Investment advice "10 stocks to buy": NO
   - Earnings call transcripts (info already in the numbers): NO

Output JSON:
{
  "push": true/false,
  "confidence": 0.0-1.0,
  "reason": "One sentence explaining your decision",
  "expected_impact": "high|medium|low|none",
  "affected_tickers": ["NVDA", "AAPL"],  // empty if broad market
  "category": "policy|macro|corporate|geopolitics|market_structure|other"
}

Be SELECTIVE. A typical trading day should have 3-10 alerts, not 50.
When in doubt, DON'T push — false negatives are better than noise.
```

### Dedup 增强

光靠 ID dedup 不够。需要**语义 dedup**：
- "Trump 加关税" 和 "白宫宣布新关税" 是同一事件
- 同一事件的多次报道只推第一次
- 用 LLM 或 embedding similarity 检测

### 社交信号

StockTwits/Reddit 不走 LLM Judge（太多太浪费），走数量阈值：
- StockTwits: watchers > 50,000 且异常增长率 > 200%
- Reddit: upvotes > 2,000 且 comments > 500
- 多平台同时异常热度 → 推

### Staleness

统一 2 小时。不区分 primary/secondary。
- 如果一条新闻 2 小时前发的，市场已经反应完了，推了也没用
- 唯一例外：盘后/盘前的重大事件可以放宽到开盘前

---

## 技术改动清单

1. **删除 keyword filter** — `alert-filter.ts` 里的 explosive keyword 匹配
2. **删除 retrospective pattern filter** — 交给 LLM 判断
3. **删除 PRIMARY_SOURCES bypass** — 白宫/SEC 也要过 LLM Judge
4. **重写 LLM gatekeeper** → 改名 LLM Judge，用新 prompt
5. **保留 social noise filter** — StockTwits/Reddit 的数量阈值
6. **统一 staleness 到 2h** — 所有来源一视同仁
7. **新建 `/api/v1/feed` endpoint** — 从 audit 表查 delivered 事件

## 预期效果

- **每天 3-10 条高质量 alert**
- 全部是新信息 + 会影响市场
- 没有事后分析、没有投资建议、没有重复
- LLM 成本：~30-50 calls/day × $0.0003 = ~$0.01/day（可忽略）
