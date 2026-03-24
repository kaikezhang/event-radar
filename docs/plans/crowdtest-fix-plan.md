# CrowdTest Fix Plan — 分批修复

**基于**: 10-Persona CrowdTest (2026-03-24), 当前分数 6.0/10
**目标**: 零售分数 8.0+ → 可以开始收费
**已修**: PR #230 修了 Top 3 (方向预测 + Price 503 + Evidence tab)

---

## Batch 1 — 数据一致性 (API + Ticker 清洗)
**预计时间**: 1 个 PR, ~2h
**目标**: 让 API 和 UI 数据一致，清理 ticker 脏数据

| 任务 | CrowdTest Issue # | 严重度 | 说明 |
|------|-------------------|--------|------|
| API classification 字段回填 | #4 | HIGH | UI 从 `metadata.llm_judge` 读分类，但 API response 的 `classification` 字段是空的。回填逻辑：event 存到 DB 时把 LLM 结果写入 classification 字段；现有数据跑一次 migration 回填 |
| API classification filter 修复 | #4 附属 | HIGH | `/api/events?classification=CRITICAL` 返回全部 events — filter 被忽略了 |
| Ticker 清洗: "FORD"→"F" | #5 | MEDIUM | ticker 提取器把公司全名当 ticker 用了，加映射表 `FORD→F`, `GOOGLE→GOOGL` 等 |
| 残留 ETF 污染 (FCX→QQQ) | #6 | MEDIUM | ETF fallback 没完全移除，某些 SEC filing 还会加 QQQ |
| Outcome cap 未应用到 StockTwits | #9 | MEDIUM | PEP 显示 ±448.8%，StockTwits outcome 没走 ±200% cap |

---

## Batch 2 — Scorecard + Search 修复
**预计时间**: 1 个 PR, ~2h
**目标**: 核心分析功能可用

| 任务 | CrowdTest Issue # | 严重度 | 说明 |
|------|-------------------|--------|------|
| T+20 outcome 计算修复 | #7 | MEDIUM | Scorecard 上 T+20 move 全显示 0.0%，outcome tracking 是核心价值主张 |
| 搜索增强 | #8 | MEDIUM | NVDA 在 24,823 条 events 里只搜出 3 条 — 需要全文搜索或至少 ticker 关联搜索 |
| Calendar 排除 StockTwits trending | honorable #12 | LOW | StockTwits trending 不是 calendar event，不应出现在 Calendar 页面 |

---

## Batch 3 — UI 完善
**预计时间**: 1 个 PR, ~2h
**目标**: 零售用户体验打磨

| 任务 | CrowdTest Issue # | 严重度 | 说明 |
|------|-------------------|--------|------|
| 字体大小控制 | #10 | LOW | Settings 里加 font size 调节 (small/medium/large)，存 localStorage |
| Daily Briefing 可展开 | honorable #13 | LOW | 点击 Daily Briefing 卡片能展开看详细内容 |
| About 页面抽象 AI 引用 | Lisa 建议 | LOW | "GPT-4" → "advanced language model"，不绑死具体模型 |
| WebSocket 断连处理 | honorable #15 | LOW | 断连时显示 "Reconnecting..." 而非假装 "Live" |

---

## Batch 4 — API 文档 + 基础设施 (Beta Launch 加分项)
**预计时间**: 1 个 PR, ~3h
**目标**: 面向技术用户 / 合作伙伴

| 任务 | 来源 | 严重度 | 说明 |
|------|------|--------|------|
| `/api/health` endpoint | Chen Wei | MEDIUM | 返回系统状态、scanner 健康、DB 连接 |
| API 文档页面 | Chen Wei / Lisa | MEDIUM | 基于现有 `ApiDocs.tsx` 完善，列出所有 endpoint + 参数 + 示例 |
| API 认证 (API Key) | Chen Wei | LOW | 简单的 API Key 认证，rate limit headers |
| rawPayload 不暴露 | Chen Wei | LOW | API response 移除内部 `rawPayload` 字段 |

---

## 不在本轮修的 (Future / Enterprise)

这些是 enterprise 级需求，不阻塞 $39/mo 零售 beta：

| 功能 | 原因 |
|------|------|
| 价格图表 (candlestick) | 大工程，需要 chart library + 实时数据源 |
| Options flow / Dark pool | 需要付费数据 (Unusual Whales $48/mo) |
| Crypto 专项覆盖 | 新 scanner + 新数据源 |
| ESG 分类标签 | 机构需求，不是零售 |
| PDF 导出 | 机构需求 |
| 白标 / Embed SDK | 合作伙伴需求 |
| 多客户 / Portfolio 视图 | RIA 需求 |

---

## 执行顺序

```
Batch 1 (数据一致性) → Batch 2 (Scorecard+Search) → Batch 3 (UI) → Batch 4 (API)
   ↓                      ↓                          ↓               ↓
 最紧急               核心功能                   体验打磨          加分项
```

**Batch 1+2 修完 → 重跑 CrowdTest → 预计零售分数 8.0+**
**Batch 3+4 修完 → 全分数 7.5+ → 可以上 $39/mo beta**

---

## 验收标准

每批修完都要：
1. `pnpm test` 全过
2. `pnpm lint` 全过
3. `pnpm --filter @event-radar/web build` 成功
4. 手动验证修复的功能点
5. PR review 后 merge
