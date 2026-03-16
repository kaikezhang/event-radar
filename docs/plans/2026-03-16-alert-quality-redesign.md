# Alert Quality Redesign — 只推有用的 Alert

> Date: 2026-03-16 | Author: Wanwan
> Goal: 彻底解决"推给用户的 alert 没用"的问题，只推那些我们 **confident 会影响股价** 且有 **明确 bullish/bearish 判断** 的事件

---

## 一、现状诊断

### 数据：57 条 delivered alerts 的质量分析

| 类别 | 数量 | 问题 |
|------|------|------|
| 🗑️ 完全垃圾 | ~15 | isinwheel 电动滑板车广告（3条多语言）、退休生活理财、CCPA 隐私投诉、Convey CEO 任命、MXF 年度股东大会 |
| 📋 SEC 8-K 噪音 | ~12 | 大量小公司的 8-K filing（Ondas、Hashdex、Radnostix、Regis Corp、Local Bounti），没 ticker、没上下文，用户不知道这是啥 |
| ⏸️ Trading Halts 噪音 | ~11 | NIVF、DXST、SKYQ、ZJYL 等小票 halt，对 swing trader 无意义，一个都不认识 |
| 📰 Breaking News 重复 | ~2 | Nebius + Meta deal 推了两条同样的新闻 |
| ✅ 真正有用 | ~10-12 | Boeing $2.34B 合同、Google 完成 Wiz 收购、油价破$100、Fed 降低银行资本要求、Fiserv 财报 miss |

**核心问题：57 条里只有 ~20% 是用户真正想看的。用户会直接关掉通知。**

### Pipeline 漏洞分析

1. **SEC 8-K 没有智能过滤** — 所有 HIGH severity 的 8-K 直接通过，不管公司多小、多无关
2. **没有 ticker 的事件照样推** — 57 条里大部分 ticker 是 NULL，用户不知道跟什么股票有关
3. **LLM Judge 太宽松** — PASS rate 太高，把 isinwheel 广告都放过了
4. **Enrichment 没参与过滤决策** — LLM enrichment 给了 action（🔴/🟡/🟢）但这个结果没用来决定推不推
5. **没有 direction gate** — enrichment 给了 tickers 的 bullish/bearish/neutral 判断，但 neutral 的也推了
6. **Trading halt 无差别推送** — 不管是 AAPL halt（大事）还是 CMCI halt（没人知道），统统推
7. **Dedup 不够** — Nebius 同一个新闻推了两条

---

## 二、设计原则

**产品定位：Event Radar 只推那些我们 confident 会影响股价、并且有明确 bullish/bearish 判断的事件。**

### 用户收到一条 alert 时，必须同时满足三个条件：

1. **📊 有具体的 Ticker** — 用户需要知道这跟哪只股票有关
2. **📈📉 有明确的 Direction** — bullish 或 bearish，不推 neutral
3. **🎯 有足够的 Confidence** — 我们对这个判断有信心（≥0.7）

### 换句话说：
- ❌ "SEC 8-K: Ondas Inc. — Item 1.01" → 没 ticker、没 direction → 不推
- ❌ "isinwheel launches spring promotions" → 不是股市事件 → 不推
- ❌ "CMCI trading HALTED" → 小票、用户不关心 → 不推
- ✅ "Boeing (BA) Awarded $2.34B Air Force Contract — 📈 Bullish, Confidence 0.9" → 推！
- ✅ "Fiserv (FISV) Missed Earnings — 📉 Bearish, Confidence 0.88" → 推！

---

## 三、实现方案

### 3.1 新增 Delivery Gate（在 enrichment 之后、delivery 之前）

这是最关键的一层。不改 L1 filter 和 LLM Judge（它们的工作是过滤明显的垃圾），而是在 enrichment 之后加一道 **Delivery Gate**。

```
Events → L1 Filter → LLM Judge → LLM Enrichment → 🆕 Delivery Gate → Delivery
```

**Delivery Gate 规则：**

```typescript
interface DeliveryGateResult {
  deliver: boolean;
  reason: string;
  tier: 'critical' | 'high' | 'standard'; // 决定推送方式
}

function shouldDeliver(event: RawEvent, enrichment: LLMEnrichment | null): DeliveryGateResult {
  // Rule 1: 必须有至少一个 ticker（从 enrichment.tickers 或 event.metadata.ticker）
  const tickers = enrichment?.tickers ?? [];
  const eventTicker = event.metadata?.ticker;
  if (tickers.length === 0 && !eventTicker) {
    return { deliver: false, reason: 'no ticker identified', tier: 'standard' };
  }

  // Rule 2: 必须有明确的 direction（bullish 或 bearish）
  const hasDirection = tickers.some(t => t.direction === 'bullish' || t.direction === 'bearish');
  if (!hasDirection && enrichment?.action !== '🔴 High-Quality Setup') {
    return { deliver: false, reason: 'no clear direction (all neutral)', tier: 'standard' };
  }

  // Rule 3: Enrichment confidence gate
  // 🔴 High-Quality Setup → 直接推
  // 🟡 Monitor → 需要 confidence ≥ 0.8
  // 🟢 Background → 不推
  if (enrichment?.action === '🟢 Background') {
    return { deliver: false, reason: 'background event, not actionable', tier: 'standard' };
  }
  
  if (enrichment?.action === '🟡 Monitor') {
    // Monitor 级别需要更高的 confidence 才推
    // 实际场景：大部分 Monitor 不应该推，除非特别有信心
    return { deliver: false, reason: 'monitor-level event, not confident enough to alert', tier: 'standard' };
  }

  // Rule 4: Trading halt 只推大票（市值 or watchlist）
  if (event.source === 'trading-halt') {
    const ticker = eventTicker?.toUpperCase();
    if (ticker && !isNotableTicker(ticker)) {
      return { deliver: false, reason: `trading halt for unknown small-cap ${ticker}`, tier: 'standard' };
    }
  }

  // Rule 5: SEC 8-K 只推大公司 or watchlist 里的
  if (event.source === 'sec-edgar' && event.type?.includes('8-K')) {
    const ticker = eventTicker?.toUpperCase() ?? tickers[0]?.symbol?.toUpperCase();
    if (!ticker || !isNotableTicker(ticker)) {
      return { deliver: false, reason: `SEC filing for small/unknown company`, tier: 'standard' };
    }
  }

  // Passed all gates → determine tier
  const tier = enrichment?.action === '🔴 High-Quality Setup' ? 'critical' : 'high';
  return { deliver: true, reason: 'passed all delivery gates', tier };
}
```

### 3.2 `isNotableTicker()` — 判断一个 ticker 是否值得推

```typescript
// 方案1: Watchlist + Top 500（最简单，先用这个）
function isNotableTicker(ticker: string): boolean {
  // 用户 watchlist 里的 → 一定推
  if (userWatchlist.has(ticker)) return true;
  
  // S&P 500 + Nasdaq 100 + 常见大票 → 推
  if (NOTABLE_TICKERS.has(ticker)) return true;
  
  // 其他的 → 不推（以后可以加市值筛选）
  return false;
}

// 可以从文件加载，定期更新
const NOTABLE_TICKERS = new Set([
  // S&P 500 top holdings + Nasdaq 100 + popular names
  // 大概 600 个 ticker
]);
```

### 3.3 增强 LLM Enrichment Prompt — 强制要求 ticker 和 direction

当前 enrichment prompt 的 `tickers` 字段是可选的，很多事件返回空数组。需要改成：

```
IMPORTANT: You MUST identify at least one specific US-listed ticker symbol that this event directly impacts. 
If you cannot identify a specific ticker, set tickers to an empty array — this event will NOT be sent to users.
For each ticker, you MUST provide a direction: "bullish" or "bearish". 
Only use "neutral" if the event is genuinely ambiguous (rare — most events lean one way).
```

### 3.4 改进 Alert Card 格式 — 突出核心信息

现在的 Discord embed 太长、太多信息。用户需要 3 秒内判断要不要看：

**新格式（简洁版）：**

```
📈 BA — Bullish | Confidence 0.9
Boeing Awarded $2.34B Air Force Contract

Why it matters: Largest defense contract in 6 months, 
backlog now at record high. Historically similar contracts 
led to +3.2% avg move in 5 days (12 samples, 75% win rate).

Risk: Government contract execution delays; sector rotation out of defense.

Source: Breaking News • 2 min ago
```

**对比现在的格式（信息过载）：**
```
🔴 CRITICAL
The Boeing Company (BA) Awarded $2.34 Billion Air Force Contract Modification
[一大段 body text]
Source: 📰 Breaking News  🕐 ...
Severity: 🔴 CRITICAL
[AI Analysis 一大段]
[Historical Pattern 一大段]
[Market Regime 一大段]
[Disclaimer]
```

### 3.5 推送分级（Tier-based Delivery）

| Tier | 条件 | 推送方式 |
|------|------|---------|
| 🔴 Critical | 🔴 High-Quality Setup + confidence ≥ 0.85 | Discord + Bark push + 未来 Web Push |
| 🟠 High | Bullish/Bearish + confidence ≥ 0.7 | Discord only |
| 不推 | Background / Monitor / No ticker / Neutral | 只记录到 DB，不推送 |

---

## 四、实施计划

### Phase 1: Delivery Gate（最高优先级，1天）
1. 创建 `packages/backend/src/pipeline/delivery-gate.ts`
2. 在 app.ts pipeline 中，enrichment 之后、delivery 之前插入 gate
3. 加载 notable tickers 列表（先硬编码 S&P 500 + Nasdaq 100）
4. Pipeline audit 记录 gate 的 pass/block 结果
5. 测试：用最近 57 条 delivered events 回测，确认垃圾被过滤

### Phase 2: Enrichment Prompt 强化（0.5天）
1. 修改 LLM enrichment prompt，强制要求 ticker 和 direction
2. 测试 prompt 变更对 enrichment 质量的影响

### Phase 3: Alert Card 重设计（1天）
1. 简化 Discord embed 格式
2. 突出 Ticker + Direction + Confidence
3. 精简 AI Analysis 到 2-3 句话
4. 移除 Disclaimer（改到 channel description 里写一次）

### Phase 4: Dedup 增强（0.5天）
1. 同一个 underlying event 只推一条（Nebius 问题）
2. 用 ticker + event_type + 30min 窗口做 semantic dedup

---

## 五、预期效果

| 指标 | 现在 | 目标 |
|------|------|------|
| 每日 alerts | 20-30 条 | 3-8 条 |
| 用户有用率 | ~20% | >80% |
| 有 ticker 率 | ~30% | 100% |
| 有 direction 率 | ~40% | 100% |
| False positive (垃圾推送) | ~50% | <10% |

**核心指标：用户看到每一条 alert 都知道 (1) 哪只股票 (2) 看涨还是看跌 (3) 为什么。**

---

## 六、未来扩展（不在本次 scope）

- Watchlist-first 过滤：用户设了 watchlist 后，只推 watchlist 里的 ticker
- 市值过滤：接入市值数据，只推市值 >$1B 的公司
- 用户反馈循环：用户标记 alert 有用/无用，调整 confidence threshold
- 历史准确率 badge：显示该类事件的历史预测准确率
