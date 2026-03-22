# Event Radar — Phase 4: Production Readiness

**日期:** 2026-03-22
**基于:** Alex Final Review (B+, NPS 7) + CrowdTest Report (5.8/10, NPS 5.3)
**目标:** B+ → A | NPS 7 → 8+ | CrowdTest 5.8 → 8+

---

## 分析：两份报告的交叉发现

Alex (swing trader, 深度使用) 和 CrowdTest (3 种 persona, 广度覆盖) 指向了**不同层面的问题**：

| 层面 | Alex 看到的 | CrowdTest 看到的 |
|------|-----------|-----------------|
| **稳定性** | WS 稳定了 ✅ | Feed crash! `items?.map` 2/3 中招 🚨 |
| **信任** | Scorecard reframe OK | 没有 About/Privacy/Terms 🚨 |
| **数据** | 财报数据修好了 | Outcome 覆盖率仍然低 (0.7%) |
| **UX** | 整体 8-9/10 | Save 无反馈、Sort 不持久、Smart Feed 按钮坏 |
| **内容** | Evidence tab 有改善 | Evidence tab 重复摘要（没有真正的证据） |

**关键洞察：Alex 用了产品 3 次没遇到 crash，但 CrowdTest 的 2/3 新用户一进来就 crash 了。**

这说明 crash 是**导航路径相关**的 — Alex 习惯的操作路径不触发，但新用户的探索路径容易触发。这是 QA Playbook 没覆盖到的场景。

---

## 优先级框架

用 **Impact × Frequency** 排序，不按"好修不好修"排：

| 优先级 | 问题 | Impact | Frequency | 来源 |
|--------|------|--------|-----------|------|
| **P0** | Feed crash (AlertCard.tsx:595) | 致命 | 2/3 新用户 | CrowdTest |
| **P0** | 无 ErrorBoundary | 致命 | 每次 crash | CrowdTest |
| **P1** | 无 About/Privacy/Terms | 信任崩塌 | 每个怀疑者 | CrowdTest |
| **P1** | "What is Smart Feed?" 按钮坏 | 新手困惑 | 每个首次用户 | CrowdTest |
| **P1** | Evidence tab 重复摘要 | 深度不足 | 每次点 Evidence | Alex + CrowdTest |
| **P2** | Settings Save 无确认 | UX 差 | 每次保存 | CrowdTest |
| **P2** | Sort 不持久 | Power user 烦 | 每次导航 | CrowdTest |
| **P2** | History 无默认 HIGH+ 筛选 | 噪音多 | 每次看 History | Alex |
| **P2** | "dummy" source 仍在源列表 | 数据脏 | 偶尔看到 | Alex |
| **P3** | Outcome 覆盖率低 (0.7%) | 信任弱 | 看 Scorecard | Both |
| **P3** | Daily Briefing 关了没法恢复 | 小不便 | 偶尔 | CrowdTest |
| **P3** | 事件详情丰富度不一致 | 体验差 | 取决于来源 | Both |

---

## Sprint 计划

### 🚨 Sprint 15: Crash + Trust Foundation (1 天)
> 不修 crash 什么都别谈

**15.1 Fix Feed crash — `items?.map is not a function`**
- 位置: `AlertCard.tsx:595`, `SourceDetailStrip` 组件
- 修法: `Array.isArray(items) ? items.map(...) : []`
- 同时检查所有 `.map()` 调用，加 null guard
- 测试: 从 Watchlist → Feed、Scorecard → Feed、Settings → Feed，每条路径走 3 遍

**15.2 加 React ErrorBoundary**
- 在 `App.tsx` 的 router 外层加 ErrorBoundary
- 用户看到: "Something went wrong. Click to reload." + 一键刷新
- 不暴露文件路径、stack trace、"Hey developer" 消息
- Log error 到 console（开发环境可见）

**15.3 加 Footer — About / Privacy / Terms**
- 简约 footer: © 2026 Event Radar | About | Privacy | Terms | Not financial advice
- About: 一段话 "Event Radar is an AI-powered event detection platform..."
- Privacy: 基础模板（不收集 PII, 使用 cookies for preferences）
- Terms: "Not financial advice" disclaimer + basic ToS
- 可以先用静态页面，不需要 CMS

**验收:** 新用户任何导航路径都不会看到 raw crash；底部有法律链接

---

### 🟠 Sprint 16: UX 缺陷修复 (1 天)
> CrowdTest 发现的具体 UX 问题

**16.1 Fix "What is Smart Feed?" 按钮**
- 检查 tooltip/popover 组件 — 之前 Sprint 4 加的可能有 bug
- 点击应该显示: "Smart Feed shows events matching your watchlist + all CRITICAL events + HIGH from trusted sources."

**16.2 Settings Save 确认反馈**
- Save 按钮点击后:
  - 成功: 按钮变绿 "Saved ✓"，2 秒后恢复
  - 失败: Toast "Failed to save. Try again."
- Discord webhook "Test" 按钮也需要反馈

**16.3 Sort 偏好持久化**
- 用 localStorage 存 `feedSortPreference`
- 页面加载时读取并应用
- 适用于 Feed 页面的 sort dropdown

**16.4 Watchlist 新增 ticker 追加到底部**
- 新加的 ticker 不应该打乱已有顺序
- append 到列表末尾

**验收:** Smart Feed 有解释；Save 有反馈；Sort 导航后不丢

---

### 🟡 Sprint 17: 内容质量提升 (2 天)
> 从"有数据"到"数据有用"

**17.1 Evidence tab 真正的证据**
- 问题: 当前 Evidence 只是重复 Summary 的文字
- 修法:
  - 显示**原始来源链接**（source URL from metadata）
  - 显示**原文摘录**（raw source text，不是 AI 改写的）
  - 如果有多个来源确认，显示 corroboration list
  - 如果没有额外证据: "No additional source data — this event was classified from a single source."
- 不同来源的 Evidence:
  - SEC filing → accession number + EDGAR 链接
  - Breaking news → 原文 URL + quote
  - Truth Social → 原始帖子链接
  - StockTwits → trending 统计

**17.2 History 默认 HIGH+ 筛选**
- 默认 severity filter: `['HIGH', 'CRITICAL']`
- 页面顶部提示: "Showing important events only. Show all →"
- 这一条 Alex 提了两次

**17.3 删除 dummy source 数据**
- SQL: `DELETE FROM events WHERE source = 'dummy'`
- 确保 source filter dropdown 也不显示 dummy

**17.4 事件详情丰富度一致性**
- 对所有 CRITICAL/HIGH 事件，确保都有:
  - Bull/Bear case（即使简短）
  - 如果 LLM enrichment 没提供，显示 "Analysis not available for this event"
  - 不是有的事件有 10 个 section，有的只有 1 个

**验收:** Evidence tab 有真实来源链接；History 不再是 24k 噪音；dummy 消失

---

### 🟢 Sprint 18: 信任加固 (1-2 天)
> 让 Marcus（怀疑者）也愿意用

**18.1 Outcome 覆盖率显示优化**
- 当前: "94 verdicts / 11,754 alerts" = 0.8%，看起来很差
- 改法: 只显示有 T+5 数据的 outcome（不是全部 alerts）
- "94 verdicts from 380 eligible events (24.7%)" 比 "94/11,754 (0.8%)" 好得多
- 加一句: "Events need 5+ trading days to reach verdict eligibility."

**18.2 Daily Briefing 可恢复**
- 关掉后在 Settings 或 Feed 页面有 "Show today's briefing" 按钮
- 或者第二天自动重新出现（目前已有但 CrowdTest 没测到第二天）

**18.3 Not Financial Advice 弹窗**
- 首次使用时弹一个 disclaimer modal
- "Event Radar provides information, not financial advice. Always do your own research."
- 勾选 "I understand" 后不再弹出
- 储存在 localStorage

**验收:** Scorecard 覆盖率看起来合理；Briefing 可恢复；有法律 disclaimer

---

## 时间线

| Sprint | 内容 | 预估 | 目标 |
|--------|------|------|------|
| **S15** | Crash fix + ErrorBoundary + Footer | 1 天 | 零 crash + 信任基础 |
| **S16** | UX 缺陷 (4 项) | 1 天 | CrowdTest UX score 8+ |
| **S17** | 内容质量 (4 项) | 2 天 | Evidence 有价值 + 噪音清理 |
| **S18** | 信任加固 (3 项) | 1-2 天 | 怀疑者也愿意用 |
| **总计** | | **~5-6 天** | |

---

## 成功标准

### Alex Re-review
- Grade: **A-** (从 B+)
- NPS: **8+** (从 7)
- "Would I recommend?" → **Unconditional yes**

### CrowdTest Re-run
- Score: **8+/10** (从 5.8)
- NPS: **7+** (从 5.3)
- Critical issues: **0** (从 2)
- Error Handling score: **8+** (从 3.3)
- Task Completion: **100%** (从 67%)

### 产品里程碑
- ✅ 新用户 0 crash
- ✅ 有法律页面
- ✅ Evidence tab 有真实证据
- ✅ History 默认高质量
- ✅ UX 反馈完整（Save、Sort、Tooltip）

---

## 与之前 Phase 的关系

| Phase | 重点 | 状态 |
|-------|------|------|
| Phase 1 (S0-S5) | 功能交付 | ✅ 完成 |
| Phase 2 (S6-S10) | 数据填充 | ✅ 完成 |
| Phase 3 (S11-S14) | Trust Killer 修复 | ✅ 完成 |
| **Phase 4 (S15-S18)** | **Production Readiness** | 🔜 |
| Phase 5 (TBD) | Scale & Monetization | ⏳ |

Phase 4 完成后，产品可以正式作为 **paid beta ($29/月)** 推出。
