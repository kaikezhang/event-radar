# Event Radar — 数据+AI质量行动方案

**Date:** 2026-03-24
**Based on:** CC Deep Research + Codex Deep Research
**Core Finding:** LLM 分类和 enrichment 根本没在生产环境运行！

---

## 🚨 最大发现

**两个 agent 独立确认了同一个核心问题：LLM 没在跑。**

- CC: "25,701 个事件中 0 个有 LLM enrichment 存储"
- Codex: "live classifier prompt is not actually in the production ingest path"
- 原因: `app.ts:113-115` 没有把 `llmClassifier` 连到生产环境

这意味着我们的"AI 分类"一直只是 rule engine 在跑，LLM 根本没参与。

---

## Sprint 1: 修基础（2-3 小时）

这些修完后所有其他改进才有意义。

| # | Task | File | Effort | Impact |
|---|------|------|--------|--------|
| **S1.1** | **开启 LLM 分类器** — 在 app.ts 里 wire llmProvider | `app.ts:113-115` | 1h | 从 rule-only → rule+LLM |
| **S1.2** | **修 LLM enrichment 持久化** — enrichment 结果存到 event metadata | `event-pipeline.ts:~428` | 1h | 0% → 100% enrichment 存储 |
| **S1.3** | **修 penny stock outcome 污染** — 过滤 event_price < $1 或 cap change at ±100% | `outcome-tracker.ts:134-155` | 1h | 统计从废数据 → 可用 |

---

## Sprint 2: 修数据质量（4-6 小时）

| # | Task | File | Effort | Impact |
|---|------|------|--------|--------|
| **S2.1** | **去掉 ETF fallback ticker** — SPY/QQQ/XLE 不应该作为事件的 canonical ticker | `ticker-inference.ts:107-143` | 2h | 消除虚假 ticker |
| **S2.2** | **SEC-Edgar CIK→ticker 映射** — 84.5% 无 ticker 的最大源 | `sec-edgar-scanner.ts:522-553` | 3h | 15% → 60%+ ticker 覆盖 |
| **S2.3** | **Block 无价值 Form 4** — $0 transaction value 的 Form 4 不发 LLM | `alert-filter.ts` | 1h | 省 $192/月 LLM 成本 |
| **S2.4** | **修 price-service 1h window** — 用分钟级价格替代日线 | `price-service.ts:149-163` | 2h | 1h outcome 从废数据 → 真实 |

---

## Sprint 3: 修分类质量（3-4 小时）

| # | Task | File | Effort | Impact |
|---|------|------|--------|--------|
| **S3.1** | **Breaking news CRITICAL 过严** — 退休金文章不该 CRITICAL | `default-rules.ts:323-620` | 2h | 减少假 CRITICAL |
| **S3.2** | **Direction 放开** — 不再强制 NEUTRAL，让 LLM 预测（现在 LLM 真的在跑了）| `classification-prompt.ts:13-38` | 1h | 方向预测从废 → 有参考 |
| **S3.3** | **Enrichment prompt 加分类上下文** — 把 severity/eventType 传给 enricher | `llm-enricher.ts:167-177` | 1h | enrichment 更精准 |

---

## Sprint 4: 修源数据（2-3 小时）

| # | Task | File | Effort | Impact |
|---|------|------|--------|--------|
| **S4.1** | **修死掉的 RSS feed** — Reuters/AP feeds 在 breaking-news 里已挂 | `breaking-news-scanner.ts:14-43` | 1h | 减少 scan 失败 |
| **S4.2** | **Political ticker blacklist 增强** — MADE/ICE/NATO/FBI 不是 ticker | ticker extraction | 1h | 消除假 ticker |
| **S4.3** | **Federal Register source 修正** — 一个 scanner 污染多个 source 名 | `federal-register-scanner.ts:130-185` | 1h | scorecard 按源统计准确 |

---

## 两份报告一致同意的优先级

| Rank | 改动 | CC Score | Codex Priority | 共识 |
|------|------|----------|---------------|------|
| 1 | **开启 LLM 分类** | P0 (2.0) | P0 | ✅ 必须第一个做 |
| 2 | **修 penny stock 污染** | P0 (9.0) | P0 | ✅ 必须做 |
| 3 | **修 enrichment 存储** | P0 (5.0) | P0 | ✅ 必须做 |
| 4 | **去掉 ETF fallback** | — | P1 | ✅ 高优先 |
| 5 | **SEC CIK→ticker** | P1 (1.33 变体) | P1 | ✅ 高优先 |
| 6 | **Block Form 4 waste** | P1 (6.0) | — | ✅ 省钱 |
| 7 | **修 price-service 1h** | — | P0 | Codex 独有发现 |
| 8 | **Breaking news 规则收紧** | — | P2 | ✅ 一致 |

---

## 两份报告的分歧

| 话题 | CC 观点 | Codex 观点 | 晚晚判断 |
|------|---------|-----------|---------|
| Direction 预测 | 保持 NEUTRAL（1.85% 太差）| 放开让 LLM 预测 | **先 NEUTRAL，等 LLM 跑稳了再放开** |
| Rule engine context 给 LLM | 不给（避免 LLM 抄答案）| 要给（更准）| **给 source 和 type，不给 severity** |
| Form 4 处理 | Block 所有无价值的 | 改善 CIK→ticker 映射 | **两个都做** |

---

## 预期效果

| 指标 | 修前 | Sprint 1 后 | Sprint 2 后 | Sprint 4 后 |
|------|------|------------|------------|------------|
| LLM 分类覆盖 | 0% | 100% HIGH/CRITICAL | 100% | 100% |
| Enrichment 存储 | 0% | 100% | 100% | 100% |
| 有用 outcome 统计 | 废（153% avg） | 真实（去 penny stock）| 更准（真 1h 价格）| 稳定 |
| Ticker 覆盖 | 49% | 49% | ~65% | ~70% |
| 假 CRITICAL | 多 | 多 | LLM 纠偏 | 规则+LLM 联合 |
| LLM 月成本 | ~$0 | ~$300 | ~$100（省 Form4）| ~$100 |

---

_Sprint 1 是今天要做的。不做 Sprint 1，后面全是空谈。_
