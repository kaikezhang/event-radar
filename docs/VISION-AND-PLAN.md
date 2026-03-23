# Event Radar — Vision & Execution Plan

**Date:** 2026-03-23
**Based on:** CC Product Rethink + Codex Technical Audit + 5-Persona User Needs Analysis
**Current State:** 7.8/10 CrowdTest, 4.8/10 User Needs Satisfaction

---

## Vision

**Event Radar 是给政治/宏观交易者的事件情报平台。**

不是 Bloomberg（做不起），不是 Unusual Whales（没 options 数据），不是 Reddit（不结构化）。

我们独有的：
1. **Truth Social → Market Impact 映射** — 没有竞品做这个
2. **Outcome Tracking** — 事件发生后追踪价格，证明哪些源靠谱
3. **多源 AI 分类** — 13+ 数据源统一分类、去噪、排序
4. **Setup Worked Rate** — 不是预测未来，而是量化"这类事件历史上赚过几次钱"

**目标用户：David（Swing Trader，$100K，持仓 3-10 天）**
- 已经在付 $48-117/月给 Unusual Whales / Benzinga
- 最接近 PMF — 要的是 event-driven setups + 历史验证
- 愿意为"别人没有的信号源"付费

---

## 执行计划

### Phase 1: Fix What's Broken（本周）
> 不修这些，什么新功能都没意义

| # | Task | Why | Est. | Status |
|---|------|-----|------|--------|
| 1 | **修 LLM enrichment 可靠性** — 0/2866 HIGH/CRITICAL 有 enrichment 显示。存储路径存在但数据没到前端 | Bull/Bear analysis 是核心卖点却全显示空 | 3 days | 🔧 部分修了 (#215) |
| 2 | **清理死掉的 scanner** — 从 UI/文档中移除 5 个死掉的源（congress, analyst, short-interest, doj, unusual-options）| 号称 23 源实际 13 个 = 失信 | 1 day | |
| 3 | **修 trending ticker 提取** — CIK/INC/CORP 被误识别为 ticker | 每个看到假 ticker 的用户都会质疑数据质量 | 1 day | |
| 4 | **修 enrichment pipeline** — 确保 CRITICAL/HIGH 事件 100% 有 bull/bear analysis | 最重要的事件反而没分析 = 产品倒挂 | 2 days | |

**Phase 1 完成标志：** 所有 CRITICAL/HIGH 事件有 bull/bear analysis，无假 ticker，scanner 数量诚实。

---

### Phase 2: 核心产品差异化（Week 2-3）
> 让 David 说 "这个 Unusual Whales 没有"

| # | Task | Why | Est. |
|---|------|-----|------|
| 5 | **Earnings Calendar 页面** — 用 Alpha Vantage 免费 API 拉 earnings 日期，overlay 历史 outcome | Swing trader 第一需求：下周有哪些 earnings？历史上 beat/miss 后涨/跌多少？ | 5 days |
| 6 | **改善 Similar Events** — 不只是"看看类似事件"，要显示 outcome 分布（X% 涨 > 5%，Y% 跌 > 5%）| 这是回测的 lite 版，现在就能做 | 3 days |
| 7 | **Audio Alert（浏览器版）** — CRITICAL 事件浏览器 beep + 语音播报标题 | Day trader 桌面场景刚需，代码已有 `useAudioSquawk` | 2 days |
| 8 | **Truth Social 增强** — 分类准确性调优（今天 Trump 和谈帖子应该 CRITICAL 不是 MEDIUM）| 我们的独有信号源，必须准 | 2 days |

**Phase 2 完成标志：** 有 earnings calendar，similar events 有数据支撑，CRITICAL alert 有声音，Truth Social 分类准确。

---

### Phase 3: 商业化（Week 4-5）
> 能收钱了

| # | Task | Why | Est. |
|---|------|-----|------|
| 9 | **$39/月 单一付费 tier** — Stripe 接入，14 天免费 trial | $39 不是 $29 — 信号质量定价。David 已经付 $48 给 UW | 3 days |
| 10 | **Public Scorecard Weekly Report** — 每周自动发布"哪些事件赚钱了"| 内容营销 + SEO + 信任建设 | 2 days |
| 11 | **Landing page + SEO 基础** — 产品介绍、定价、注册流程 | 现在连个正经首页都没有 | 3 days |
| 12 | **Production deploy** — 正式域名、SSL、CDN、监控 | dev mode 跑生产 = 不专业 | 2 days |

**Phase 3 完成标志：** 有人能通过网页注册、付费、使用产品。

---

### Phase 4: 增长（Week 6-8）
> 从 0 到 50 个付费用户

| # | Task | Why | Est. |
|---|------|-----|------|
| 13 | **Discord bot** — 在交易社群直接查事件、设 alert | David 和他的交易群在 Discord 里 | 5 days |
| 14 | **API 文档 + 基础 API 产品** — OpenAPI spec + API key 管理 | 开发者/quant 用户需要 | 3 days |
| 15 | **交易社群合作** — 找 3-5 个 Discord/Reddit 交易社群做推广 | Distribution > Product | 持续 |

---

## 不做的事（至少 3 个月内）

| 不做 | 为什么 |
|------|--------|
| ❌ Options flow | 没有靠谱免费数据源，UW API 已死 |
| ❌ 真正的回测引擎 | 只有 30 天数据，统计不显著 |
| ❌ Advisor mode | 完全不同的产品，需要 CRM 集成 + 合规审查 |
| ❌ Broker 集成 | 法律风险 + 用户量不够 justify 开发成本 |
| ❌ 免费 tier | 烧 infra 没转化。用 14 天 trial 代替 |
| ❌ 全平台移动 app | Web first，先做好再考虑 native |

---

## 成功指标

| 时间 | 目标 |
|------|------|
| Week 2 | CrowdTest 8.5+/10 |
| Week 4 | 第一个付费用户 |
| Week 8 | 50 付费用户，$1,950 MRR |
| Month 3 | 200 付费用户，$7,800 MRR |
| Month 6 | 500 付费用户，$19,500 MRR |

---

## 竞争定位

```
                    价格低 ←→ 价格高
                    │
   Reddit/Twitter   │   Event Radar ($39)    Benzinga Pro ($117)
   (免费，噪音多)    │   (AI 分类 + 追踪)      (速度快，人工编辑)
                    │
                    │   Unusual Whales ($48)  Bloomberg ($2K/月)
                    │   (Options flow 强)     (什么都有)
                    │
```

**我们的位置：** $39 价位，比免费工具结构化，比 $100+ 工具便宜，独有 Truth Social + Outcome Tracking。

---

_这不是一个"做所有事"的计划。这是一个"做对的事，做完，收钱"的计划。_
