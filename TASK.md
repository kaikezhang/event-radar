# TASK.md — Evolution Phase 2: 让 Alert 有价值

## Overview

Phase 1 已完成（LLM enrichment 开启、SEC EDGAR scanner、PR Newswire + BusinessWire RSS）。Phase 2 的目标是让每个 delivered alert 从"通知"升级为"决策辅助"——带 AI 分析、历史模式、市场状态放大系数。

参考文档：
- `docs/EVOLUTION-STRATEGY.md` — 总体战略（战略四~七）
- `docs/MARKET-REGIME-FACTORS.md` — Market Regime 因子详细设计

---

## Task A: Market Regime Service (Codex)

实现一个 Market Regime Service，计算综合 regime score 并注入 enrichment pipeline。

### Backend — Market Regime Service

1. **新文件**: `packages/backend/src/services/market-regime.ts`
   - Class `MarketRegimeService` with interface `IMarketRegimeService`
   - 方法: `getRegimeSnapshot(): Promise<RegimeSnapshot>`
   - 方法: `getAmplificationFactor(direction: 'bullish' | 'bearish' | 'neutral'): number`

2. **Regime Factors (Tier 1, 必须实现)**:
   - **VIX**: 从 Yahoo Finance 拉 `^VIX` 当前值
   - **SPY RSI(14)**: 拉 SPY 20 天日K，计算 RSI
   - **SPY 距 52 周高/低**: 拉 SPY 1 年日K，计算当前价格距高/低的百分比
   - **SPY 20日均线 vs 50日均线**: 金叉/死叉状态
   - **10Y-2Y 利差**: 从 Yahoo Finance 拉 `^TNX`(10Y) 和 `^IRX`(2Y)，计算差值
   - 数据源: 复用已有的 `yahoo-finance2` 依赖

3. **Regime Score 计算** (-100 到 +100):
   - 各因子标准化到 [-1, +1]，加权求和
   - 权重: VIX 0.25, RSI 0.20, 52w距离 0.20, 均线 0.15, 利差 0.20
   - Score mapping:
     - +80 to +100 = 极度超买（坏消息 2.0-3.0x, 好消息 0.5x）
     - +40 to +80 = 偏高（坏消息 1.5x, 好消息 0.7x）
     - -40 to +40 = 中性（1.0x）
     - -80 to -40 = 偏低（好消息 1.5x, 坏消息 0.7x）
     - -100 to -80 = 极度超卖（好消息 2.0-3.0x, 坏消息 0.5x）

4. **缓存**: 5 分钟 in-memory cache（Market data 不需要实时）

5. **Schema**: 新类型在 `packages/shared/src/types/`
   ```ts
   interface RegimeSnapshot {
     score: number;             // -100 to +100
     label: 'extreme_oversold' | 'oversold' | 'neutral' | 'overbought' | 'extreme_overbought';
     factors: {
       vix: { value: number; zscore: number };
       spyRsi: { value: number; signal: 'oversold' | 'neutral' | 'overbought' };
       spy52wPosition: { pctFromHigh: number; pctFromLow: number };
       maSignal: { sma20: number; sma50: number; signal: 'golden_cross' | 'death_cross' | 'neutral' };
       yieldCurve: { spread: number; inverted: boolean };
     };
     amplification: {
       bullish: number;   // multiplier for bullish events
       bearish: number;   // multiplier for bearish events
     };
     updatedAt: string;
   }
   ```

6. **API Endpoint**: `GET /api/regime` — 返回当前 RegimeSnapshot（需要 auth）

7. **Tests**: ≥10 个测试 — score 计算、amplification mapping、cache 行为、edge cases（VIX spike、RSI 极端值）

---

## Task B: Rich Delivery Format + Regime Integration (CC)

升级 delivery 格式，让每个 alert 包含 AI 分析 + 历史模式 + Market Regime 放大系数。

### Backend — Enriched Delivery

1. **修改 LLM Enricher** (`packages/backend/src/pipeline/llm-enricher.ts`):
   - 在 enrichment prompt 中注入 Market Regime snapshot
   - 新增 prompt section:
     ```
     ## Market Context
     Current regime: {label} (score: {score})
     VIX: {vix}, SPY RSI: {rsi}, Yield Curve: {spread}bp ({inverted ? 'INVERTED' : 'normal'})
     
     Consider this market context when analyzing the event's potential impact.
     A {label} market means {explanation of amplification}.
     ```
   - LLM 输出增加字段: `regimeContext: string`（AI 对市场状态如何放大/减弱此事件的分析）

2. **修改 Delivery 模板** — 所有渠道（Discord/Bark/Telegram/Webhook）:
   - 新增 sections:
     - **🤖 AI Analysis** — LLM enricher 的 summary + impact
     - **📊 Historical Pattern** — 相似事件的 T+5/T+20 avg return 和 win rate（从 similarity service 获取）
     - **📈 Market Regime** — 当前 regime score + label + amplification factor
     - **⚖️ Disclaimer** — "AI-generated analysis. Not financial advice."
   - Discord embed 格式参考 `docs/EVOLUTION-STRATEGY.md` 的 "战略七" 模板
   - Bark push 使用简化版（title + 1 行 AI summary + regime label）

3. **Historical Pattern 集成**:
   - 调用已有的 `similarity.ts` service
   - 对每个 delivered event，查询 top 5 相似历史事件
   - 计算平均 T+5, T+20 return 和 win rate
   - 如果没有足够历史数据，显示 "Insufficient historical data"

4. **Action 字段改为信息性表述**（来自 review 决策）:
   - ❌ 不要: "Buy the dip" / "Watch for entry"
   - ✅ 要: "Historical similar events saw initial dips lasting 1-3 trading days"
   - ✅ 要: "12 similar restructuring events: 67% positive at T+20"

5. **Tests**: ≥8 个测试 — enriched delivery 格式、regime injection into prompt、historical pattern lookup、missing data fallback

---

## Task C: LLM Judge Golden Test Set (Codex)

创建一个 golden test set 来防止 LLM Judge model drift。

### Implementation

1. **Golden dataset**: `packages/backend/src/__tests__/fixtures/golden-events.json`
   - 50 个手动标注的事件样本（从 DB 的 6,788 个事件中挑选）
   - 每个样本包含:
     ```json
     {
       "id": "golden-001",
       "title": "...",
       "body": "...",
       "source": "...",
       "expectedSeverity": "HIGH",
       "expectedDirection": "bearish",
       "expectedEventType": "restructuring",
       "shouldDeliver": true,
       "reasoning": "8-K filing with $2B charge is material..."
     }
     ```
   - 覆盖所有 severity 级别、方向、事件类型
   - 包含 edge cases: 低置信度事件、边界事件、应该被 filter 的事件

2. **Golden test runner**: `packages/backend/src/__tests__/golden-judge.test.ts`
   - 对每个 golden sample，跑 LLM Judge pipeline（mock LLM response based on expected）
   - 验证: severity 匹配率 ≥ 80%, direction 匹配率 ≥ 75%, deliver/filter 匹配率 ≥ 85%
   - 输出 confusion matrix 和 per-class accuracy

3. **CI-friendly**: 测试用 mock LLM（不调真实 API），但提供 `GOLDEN_LIVE=true` flag 可以用真实 LLM 跑

4. **Drift detection script**: `packages/backend/src/scripts/golden-drift-check.ts`
   - CLI: `pnpm golden-check` — 用真实 LLM 跑所有 golden samples
   - 输出 accuracy report
   - 如果 accuracy 下降 > 5%，exit code 1（可以接入 CI）
   - 记录结果到 `data/golden-results/YYYY-MM-DD.json`

5. **Tests**: golden test runner 本身的 meta-tests（验证 runner 逻辑）≥5 个

---

## Task D: Delivered Count Health Check + Kill Switch (CC)

实现两个 review 中提到的安全措施。

### Health Check

1. **Delivered count monitor** in `packages/backend/src/services/health-monitor.ts`:
   - 每小时检查过去 24h 的 delivered count
   - 交易日（Mon-Fri, 9:30am-4:00pm ET）24h 内 0 delivery → 触发告警
   - 告警通过 EventBus emit `system:health:alert`
   - Delivery channels 订阅此事件，推送给管理员
   - API: `GET /api/health/delivery-stats` — 返回 24h/7d delivery count, 按 source 分组

2. **Kill Switch**:
   - API: `POST /api/admin/delivery/kill` — 立即停止所有 delivery
   - API: `POST /api/admin/delivery/resume` — 恢复 delivery
   - API: `GET /api/admin/delivery/status` — 返回 kill switch 状态
   - Kill switch 状态持久化到 DB（重启后保持）
   - Kill switch 激活时，所有 delivery 被 skip 但事件仍然处理 + 存储
   - 在 `/health` endpoint 中显示 kill switch 状态

3. **Tests**: ≥8 个测试 — health check 逻辑、kill switch CRUD、delivery skip 行为、trading hours 判断

---

## General Rules

- TypeScript strict mode, ESM with `.js` extensions in imports
- Follow existing patterns for consistency
- Run `pnpm test` — all tests must pass
- Run `pnpm lint` — no lint errors
- Create feature branch + PR. Do NOT push to main.
- Do NOT merge PRs.
- Use existing patterns from the codebase
- Codex reads AGENTS.md, CC reads CLAUDE.md
