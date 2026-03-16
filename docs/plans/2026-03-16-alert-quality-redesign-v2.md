# Alert Quality Redesign v2 — 只推值得交易的 Alert

> Date: 2026-03-16 | Author: Wanwan
> Incorporates feedback from: CEO Review, Eng Review (Codex), Eng Review #2
> Supersedes: `2026-03-16-alert-quality-redesign.md` (v1)

---

## 一、问题回顾

57 条 delivered alerts，只有 ~20% 有用。垃圾类型：isinwheel 广告、小公司 8-K、小票 halt、重复新闻。核心原因：pipeline 没有一层"这条 alert 值不值得打扰用户"的决策。

---

## 二、v2 核心变化（vs v1）

| v1 问题 | v2 修正 |
|---------|---------|
| 依赖不存在的 enrichment confidence 字段 | 用已有的 classifier confidence + enrichment action 组合决策 |
| `userWatchlist` 在 pre-delivery gate 里不可用 | Phase 1 只用 global notable list，不涉及 per-user watchlist |
| 硬性要求 ticker 会丢失有价值的 macro/sector alerts | 新增 `macro` 通道：macro 事件映射到 ETF proxy（deterministic mapping，不靠 LLM） |
| `🟡 Monitor` 全部 block 太激进 | Monitor + high confidence + notable ticker → 允许 feed delivery（不 push） |
| enrichment 失败 = 静默丢失 | 明确 fail-open 策略 + circuit breaker |
| 没有 shadow mode | Phase 1 先 shadow（只记录，不真的 block），Phase 2 enforce |
| prompt 强制要求 ticker 会导致幻觉 | 改为"鼓励但允许空"，用 deterministic ticker extraction 补充 |
| 新 tier 和 router 脱节 | 给 AlertEvent 加 `deliveryTier` 字段，router 消费它 |

---

## 三、设计原则

### 产品定位
> Event Radar 只用高确信的 setup 打扰你。其他的在 feed 里，不在通知里。

### 三层 surface

| Surface | Bar | 典型量 |
|---------|-----|--------|
| **Push** (Bark/Web Push) | 🔴 + high confidence + notable ticker + historical support | 1-3/day |
| **Feed** (Discord/App) | 通过 delivery gate 的所有 alert | 5-15/day |
| **Archive** (DB only) | 被 gate block 的，只记录不推送 | 全量 |

用户打开 app/Discord 看到的是 feed level（选择性比 push 宽松），不会觉得产品"死了"。

---

## 四、实现方案

### 4.1 Delivery Gate — `packages/backend/src/pipeline/delivery-gate.ts`

位于 LLM Enrichment **之后**、Historical Enrichment **之前**（节省 historical + regime 的计算量）。

```
Events → L1 Filter → LLM Judge → LLM Enrichment → 🆕 Delivery Gate → Historical → Regime → Router
```

#### 输入

```typescript
interface DeliveryGateInput {
  event: RawEvent;
  enrichment: LLMEnrichment | null;       // 可能为 null（LLM 挂了）
  classificationConfidence: number;        // 已有，classifier 产出
  confidenceBucket: ConfidenceLevel;       // 已有，'high' | 'medium' | 'low' | 'unconfirmed'
  classifierDirection: LLMDirection;       // 已有，'bullish' | 'bearish' | 'neutral'
  classifierSeverity: Severity;            // 已有
}
```

#### 输出

```typescript
interface DeliveryGateResult {
  pass: boolean;
  tier: 'critical' | 'high' | 'feed' | 'archive';
  reason: string;
  // 用于 audit
  gateDetails: {
    hasTicker: boolean;
    hasDirection: boolean;
    isNotable: boolean;
    isMacro: boolean;
    enrichmentAvailable: boolean;
    action: string | null;
    confidenceBucket: string;
  };
}
```

#### Gate 逻辑（伪代码）

```typescript
function evaluate(input: DeliveryGateInput): DeliveryGateResult {
  const { event, enrichment, confidenceBucket, classifierDirection, classifierSeverity } = input;

  // ─── Step 0: Degraded Mode (enrichment 不可用) ───
  // Fail-open: 如果 enrichment 挂了，回退到 classifier-only 判断
  if (!enrichment) {
    // CRITICAL severity + high confidence → 放行到 feed（不 push）
    if (classifierSeverity === 'CRITICAL' && confidenceBucket === 'high') {
      return { pass: true, tier: 'feed', reason: 'enrichment_unavailable_critical_passthrough', ... };
    }
    // 其他情况 → archive only（等 enrichment 恢复再正常工作）
    return { pass: false, tier: 'archive', reason: 'enrichment_unavailable', ... };
  }

  // ─── Step 1: Ticker resolution ───
  // 优先用 enrichment tickers，fallback 到 event.metadata.ticker
  const enrichmentTickers = enrichment.tickers ?? [];
  const eventTicker = event.metadata?.ticker?.toUpperCase();
  const allTickers = [
    ...enrichmentTickers.map(t => t.symbol.toUpperCase()),
    ...(eventTicker && !enrichmentTickers.some(t => t.symbol.toUpperCase() === eventTicker) ? [eventTicker] : []),
  ];

  // ─── Step 2: Macro event detection ───
  // 某些事件类型天然是 macro/sector 级别，不应要求单一 ticker
  const isMacroSource = MACRO_EVENT_TYPES.has(event.source) || MACRO_CLASSIFIER_TYPES.has(classifierEventType);
  
  if (allTickers.length === 0 && !isMacroSource) {
    return { pass: false, tier: 'archive', reason: 'no_ticker_not_macro', ... };
  }

  // Macro 事件：用 deterministic ETF proxy mapping
  if (allTickers.length === 0 && isMacroSource) {
    // 不修改 enrichment（避免幻觉），在 delivery 层面标注 proxy
    // 这些事件进入 feed，但不 push（因为无法确定具体 ticker 的 direction）
    if (confidenceBucket === 'high') {
      return { pass: true, tier: 'feed', reason: 'macro_event_high_confidence', ... };
    }
    return { pass: false, tier: 'archive', reason: 'macro_event_low_confidence', ... };
  }

  // ─── Step 3: Direction gate ───
  // 需要至少一个 ticker 有明确 direction（bullish/bearish）
  // 来源：enrichment tickers direction > classifier direction
  const hasEnrichmentDirection = enrichmentTickers.some(t => t.direction !== 'neutral');
  const hasClassifierDirection = classifierDirection !== 'neutral';
  const hasDirection = hasEnrichmentDirection || hasClassifierDirection;

  // ─── Step 4: Notable ticker check ───
  const hasNotableTicker = allTickers.some(t => notableTickers.has(t));

  // ─── Step 5: Action + Confidence 综合决策 ───
  const action = enrichment.action;

  // 🔴 High-Quality Setup
  if (action === '🔴 High-Quality Setup') {
    if (hasDirection && hasNotableTicker && confidenceBucket === 'high') {
      return { pass: true, tier: 'critical', reason: 'red_signal_notable_high_conf', ... };
    }
    if (hasDirection && confidenceBucket === 'high') {
      return { pass: true, tier: 'high', reason: 'red_signal_high_conf', ... };
    }
    // 🔴 但 confidence 不够 → feed only
    return { pass: true, tier: 'feed', reason: 'red_signal_low_conf', ... };
  }

  // 🟡 Monitor — 不全 block，但门槛更高
  if (action === '🟡 Monitor') {
    if (hasDirection && hasNotableTicker && confidenceBucket === 'high') {
      return { pass: true, tier: 'feed', reason: 'monitor_notable_high_conf', ... };
    }
    // Monitor + 非 notable 或 低 confidence → archive
    return { pass: false, tier: 'archive', reason: 'monitor_insufficient', ... };
  }

  // 🟢 Background — 永远不推
  return { pass: false, tier: 'archive', reason: 'background_event', ... };
}
```

#### Source-Specific Rules（在主逻辑之前的 pre-check）

```typescript
// Trading halt: 只放行 notable ticker
if (event.source === 'trading-halt') {
  const haltTicker = eventTicker?.toUpperCase();
  if (!haltTicker || !notableTickers.has(haltTicker)) {
    return { pass: false, tier: 'archive', reason: 'halt_unknown_ticker', ... };
  }
}

// SEC 8-K: 只放行 notable ticker 的 filing
if (event.source === 'sec-edgar') {
  const secTickers = allTickers.filter(t => notableTickers.has(t));
  if (secTickers.length === 0) {
    return { pass: false, tier: 'archive', reason: 'sec_filing_unknown_ticker', ... };
  }
}
```

### 4.2 Notable Tickers — `packages/backend/src/config/notable-tickers.json`

**不 hardcode 在代码里。** JSON 文件，启动时加载一次。

```json
{
  "_meta": {
    "description": "Tickers that pass the delivery gate's 'notable' check",
    "updated": "2026-03-16",
    "sources": ["S&P 500", "Nasdaq 100", "user watchlist"]
  },
  "tickers": [
    "AAPL", "MSFT", "AMZN", "GOOG", "GOOGL", "META", "NVDA", "TSLA",
    "... (S&P 500 + Nasdaq 100, ~550 symbols)"
  ]
}
```

规则：
- 全大写，统一格式
- `BRK.B` → normalize 成 `BRKB`（去掉 `.`、`-`）
- 包含：S&P 500 成分 + Nasdaq 100 成分 + 现有 watchlist.json 里的 ticker
- 不包含：per-user watchlist（Phase 1 不做）
- 维护：手动更新 or 未来加脚本从 index constituents API 拉

Constructor injection 供测试：
```typescript
class DeliveryGate {
  constructor(private notableTickers: Set<string>) {}
}
```

### 4.3 Macro Event ETF Proxy Mapping

Deterministic mapping，不靠 LLM，不修改 enrichment 数据。

```typescript
const MACRO_EVENT_TYPES = new Set(['econ-calendar', 'breaking-news']);
const MACRO_CLASSIFIER_TYPES = new Set([
  'economic_data', 'fed_announcement', 'executive_order', 
  'congress_bill', 'federal_register',
]);

// 用于 alert card 显示，不注入 enrichment
const SECTOR_ETF_MAP: Record<string, string[]> = {
  'oil': ['XLE', 'USO'],
  'banking': ['KRE', 'XLF'],
  'tech': ['QQQ', 'XLK'],
  'defense': ['ITA', 'XAR'],
  'biotech': ['XBI', 'IBB'],
  'rates': ['TLT', 'SHY'],
  'broad_market': ['SPY', 'QQQ'],
};
```

### 4.4 AlertEvent 扩展

```typescript
// packages/delivery/src/types.ts
export interface AlertEvent {
  // ... 现有字段 ...
  
  /** Delivery tier from the delivery gate. Controls channel routing. */
  readonly deliveryTier?: 'critical' | 'high' | 'feed';
  
  /** ETF proxies for macro/sector events (deterministic, not LLM). */
  readonly macroProxies?: string[];
}
```

### 4.5 AlertRouter 修改

```typescript
// 新的 routing 逻辑：deliveryTier 优先于 severity
async route(alert: AlertEvent): Promise<AlertRouteResult> {
  const decision = decideAlertRouting(alert);
  
  let targets: ChannelName[];
  
  if (alert.deliveryTier) {
    // 新 gate-aware 路由
    switch (alert.deliveryTier) {
      case 'critical':
        targets = ['bark', 'discord', 'telegram', 'webhook'];
        if (decision.shouldPush) targets.push('webPush');
        break;
      case 'high':
        targets = ['discord', 'webhook'];
        // 不发 Bark/Telegram — 只有 critical 才打扰手机
        break;
      case 'feed':
        targets = ['discord', 'webhook'];
        break;
    }
  } else {
    // 兼容旧路径（没经过 gate 的 alert）
    targets = decision.shouldPush
      ? [...ROUTING_TABLE[alert.severity], 'webPush']
      : ROUTING_TABLE[alert.severity];
  }
  
  // ... 现有投递逻辑 ...
}
```

### 4.6 Enrichment Prompt 调整（温和版）

**不用 "MUST"，避免幻觉。**

```diff
- "tickers": [{"symbol": "TICKER", "direction": "bullish|bearish|neutral"}],
+ "tickers": [{"symbol": "TICKER", "direction": "bullish|bearish|neutral"}]
+   // Identify directly impacted listed tickers when they are explicit or strongly implied in the event.
+   // Do NOT guess proxies, ETFs, or loosely related names.
+   // Return tickers: [] if there is no clear directly impacted listed ticker.
+   // Prefer bullish or bearish; use neutral only when the impact is genuinely ambiguous.
```

不新增 confidence 字段。Enrichment 做的是定性判断（action + tickers），定量判断用已有的 classifier confidence。

### 4.7 Audit 集成

现有 `pipeline_audit` 表已经支持 `stopped_at` 和 `reason_category`，不需要 schema migration。

```typescript
// Gate block
auditLog.record({
  eventId, source, title, severity, ticker,
  outcome: 'filtered',
  stoppedAt: 'delivery_gate',
  reason: gateResult.reason,
  reasonCategory: 'delivery_gate',
});

// Gate pass — 记录在 event metadata 里（不加新审计行，delivered 的审计行已有）
event.metadata.delivery_gate = {
  tier: gateResult.tier,
  reason: gateResult.reason,
  details: gateResult.gateDetails,
};
```

### 4.8 Discord Alert Card 重设计

**原则：3 秒内判断"要不要看"。**

```
📈 BA — Bullish Setup
Boeing Awarded $2.34B Air Force Contract

Why it matters: Largest defense contract in 6 months, backlog at record.

Similar events: 12 cases | +3.2% avg 5d | 75% win rate

Risk: Contract execution delays; defense sector rotation.

📰 Breaking News · 2 min ago
```

vs 现在的信息过载版：去掉 raw body、regime 段落、每条 disclaimer、过长 AI Analysis。

**Card 根据 tier 调整详略：**
- `critical`：完整 card（含 historical + risk）
- `high`：标准 card
- `feed`：精简 card（只有 headline + why it matters）

### 4.9 Shadow Mode

```typescript
// 环境变量控制
// DELIVERY_GATE_MODE=shadow（默认，Phase 1）| enforce（Phase 2）
const mode = process.env.DELIVERY_GATE_MODE ?? 'shadow';

if (mode === 'shadow') {
  // 记录 gate 决策到 audit log 和 metrics，但不实际 block
  deliveryGateShadowTotal.inc({ result: gateResult.pass ? 'would_pass' : 'would_block', tier: gateResult.tier });
  auditLog.recordGateShadow(eventId, gateResult);
  // 继续正常 delivery flow
} else {
  // 真的 block
  if (!gateResult.pass) {
    auditLog.record({ ... stoppedAt: 'delivery_gate' ... });
    return;
  }
}
```

---

## 五、Recall 保护（防止误杀好 alert）

Eng Review 说得对：只优化 precision 不看 recall 是危险的。

### 5.1 Blocked Alert Sampling

每天自动采样 10 条被 gate block 的事件，存到 `gate_review_queue`，在 daily report 里列出。运营（就是晚晚）定期检查有没有误杀的好 alert。

### 5.2 Outcome Backfill for Blocked Events

被 block 的事件也跑 outcome backfill：24 小时后看 ticker 的实际价格变动。如果一个被 block 的事件对应的 ticker 涨/跌 >5%，标记为 `potential_false_negative`。

### 5.3 Kill Switch

已有 kill switch 机制。Delivery gate 也支持：
```
DELIVERY_GATE_MODE=disabled → 完全跳过 gate
```

---

## 六、实施计划

### Phase 1: Shadow Mode（2-3天）

**WP 分解：**

| WP | 任务 | 估时 |
|----|------|------|
| WP-A | `delivery-gate.ts` + notable-tickers.json + unit tests | 0.5d |
| WP-B | `AlertEvent.deliveryTier` 类型扩展 + app.ts 集成（shadow mode） | 0.5d |
| WP-C | Enrichment prompt 调整 + macro event detection | 0.5d |
| WP-D | Shadow metrics + daily report integration | 0.5d |
| WP-E | 回测：用最近 7 天的 events replay gate 决策 | 0.5d |

**Phase 1 产出：**
- Gate 在 shadow mode 运行，不 block 任何 alert
- Metrics 和 audit log 记录 would_pass / would_block
- 回测报告：显示过去 7 天有多少 alert 会被 block，其中有没有好 alert

### Phase 2: Enforce + Card Redesign（Phase 1 验证后）

| WP | 任务 | 估时 |
|----|------|------|
| WP-F | 切换到 enforce mode + router 修改 | 0.5d |
| WP-G | Discord card 重设计（tier-based 详略） | 0.5d |
| WP-H | Blocked alert sampling + recall tracking | 0.5d |

### Phase 3: Dedup 增强（可选）

- 同一 ticker + 同一 event type + 30min 窗口 → 只推最早/最强的一条
- 复用现有 story-group 机制

---

## 七、预期效果

| 指标 | 现在 | Phase 1 (shadow) | Phase 2 (enforce) |
|------|------|------------------|-------------------|
| Push alerts/day | 20-30 | 20-30 (不变) | 1-3 (critical only) |
| Feed alerts/day | N/A | N/A | 5-15 |
| 有 ticker 率 | ~30% | 观测 | >90% (macro 用 proxy) |
| 有 direction 率 | ~40% | 观测 | >85% |
| False positive (垃圾) | ~50% | 观测 | <10% |

---

## 八、FAQ（Review 反馈回应）

**Q: enrichment 失败时怎么办？**
A: Fail-open 策略。CRITICAL severity + high confidence → feed。其他 → archive。不会因为 LLM 挂了就完全静默。加 circuit breaker metric 监控 enrichment 成功率。

**Q: 没有 enrichment confidence 字段怎么办？**
A: 不加新字段。用已有的 classifier confidence（数值型，0-1）+ enrichment action（定性型，🔴/🟡/🟢）组合。两个信号源独立，不混淆。

**Q: macro/sector events 怎么处理？**
A: Deterministic ETF proxy mapping（不靠 LLM）。油价 → XLE/USO，Fed → TLT/XLF。这些事件进 feed 不进 push。未来可以让用户订阅 sector。

**Q: userWatchlist 怎么办？**
A: Phase 1 不用 per-user watchlist。Global notable list 足够。Per-user 过滤是 Phase 3+ 的事，需要 recipient-aware delivery 架构改造。

**Q: 会不会把产品变"死"了？**
A: 不会。Push 变少（1-3/day），但 Feed/Discord 仍然有 5-15/day。App 打开看到的是 feed level，不是只有 push level。

**Q: prompt 改成 MUST identify ticker 会导致幻觉？**
A: 同意。改为温和措辞："identify when explicit or strongly implied, return [] if unclear"。用 deterministic ticker extraction（正则/NER）补充，不完全依赖 LLM。

**Q: 新 tier 和现有 router 怎么兼容？**
A: `AlertEvent.deliveryTier` 可选字段。有 tier → 按 tier 路由。没 tier → 走旧 severity-based 路由。零 break。
