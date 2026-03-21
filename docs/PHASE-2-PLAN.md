# Event Radar — Phase 2 Plan: From Beta to Paid

**日期:** 2026-03-21
**基于:** v2 Review (QA 93.9, NPS 6/10, 付费意愿 NO)
**目标:** NPS ≥ 8, 付费意愿 YES ($29/月), QA ≥ 95

---

## 诊断：为什么还不能收费

| Gap | 原因 | 影响 |
|-----|------|------|
| **Feed 没价格** | S1 改了 dashboard route 但没改 feed route | Trader: "没有温度的天气预报" |
| **单事件 Outcome 不可见** | 基础设施有（event_outcomes 表），前端没展示 | Trust: "BEARISH 到底对不对？" |
| **通知不可用** | Push 被 headless 拒，无 fallback channel | Retention: "还得自己来看" |
| **Event Search 404** | 搜索 Events tab 有时返回空/错误 | UX: "搜不到东西" |
| **价格图缺失** | Event detail 没有价格走势图 | Trader: "无法评估影响" |

---

## Sprint 计划

### 🔴 Sprint 6: Feed 价格数据修复（1-2 天）
> S1 的核心交付物（价格在卡片上）实际没生效，必须修

**6.1 Feed API 加 outcome join**
- 修改 feed route（`packages/backend/src/routes/events.ts` 或 feed 相关路由）
- LEFT JOIN `event_outcomes` 表
- 返回 `eventPrice`, `change1d`, `changeT5` 字段
- 不影响无 outcome 的事件（null 即可）

**6.2 验证 Feed 卡片价格渲染**
- S1 PR #182 已加了前端组件（AlertCard 里的 price display）
- 确认组件正确读取 feed 返回的价格字段
- 确认 outcome badge（✅/❌/⏳）正常显示

**6.3 Event Detail "What Happened Next" 验证**
- 确认 `/api/v1/outcomes/:eventId` 正常返回数据
- 确认 WhatHappenedNext 组件渲染价格变动

**验收:** Feed 卡片上能看到价格和涨跌幅

---

### 🟠 Sprint 7: 单事件 Outcome 展示（2-3 天）
> 闭环：看到 alert → 知道后来怎样了

**7.1 Event Detail Outcome 区域增强**
- Summary tab 的 "What Happened Next" 要显示:
  - 事件时价格: $X.XX
  - T+1d: $Y.YY (▲/▼ Z%)
  - T+5d: $Y.YY (▲/▼ Z%) — 如果有
  - T+20d: pending / $Y.YY
  - 预测正确性: ✅ Correct / ❌ Wrong / ⏳ Tracking

**7.2 Feed 卡片 Outcome Badge 修复**
- 确认 ✅/❌/⏳ badge 在 feed 卡片上可见
- Badge 逻辑: 用 T+5 change 方向 vs BEARISH/BULLISH 比对

**7.3 Watchlist "Weekly P&L" 真实数据**
- 用 `/api/v1/outcomes/stats` 或 per-ticker outcomes 计算
- "本周 X 个 alert，Y 个预测正确 (Z%)"
- 如果 "按信号操作" 的模拟 P&L: "+/- $X"

**验收:** 每个有 outcome 的 event 显示价格验证结果

---

### 🟡 Sprint 8: 通知 Fallback Channel（2-3 天）
> 推送被拒？给你 Discord/Email 替代

**8.1 Discord Webhook 用户配置**
- Settings 页面加 "Discord Webhook" 输入框
- 用户粘贴自己的 Discord webhook URL
- 后端已有 `discord-webhook.ts` delivery channel
- 加 API: `POST /api/v1/settings/notifications` 保存 webhook URL
- 高 severity 事件通过 webhook 推送到用户的 Discord

**8.2 Email Digest（可选）**
- Settings 页面加 email 输入
- 每日 digest（利用 S3 的 Daily Briefing 数据）
- 用 Resend 或 SendGrid 免费 tier

**8.3 Push 被拒 UI 升级**
- 已有分步引导（S3 做了）
- 加一句: "或者用 Discord/Email 接收提醒" → 链接到对应设置

**验收:** 用户至少有一种可用的通知渠道

---

### 🟢 Sprint 9: Event Search 修复 + 增强（1 天）
> 搜索是发现功能的核心

**9.1 修复 Events 搜索**
- 确认 `/api/events/search?q=xxx` 正常工作
- 确认前端 Events tab 正确调用此 API
- 处理错误状态（API 挂了显示错误，不是 "No results"）

**9.2 搜索结果增强**
- 搜索结果卡片加: 价格（如果有）+ outcome badge
- "Recent searches" 功能

**验收:** 搜 "SEC filing" 或 "Iran" 能找到相关事件

---

### 🔵 Sprint 10: 收尾打磨（2-3 天）
> 最后一轮打磨 → 可以收费

**10.1 Light Mode 修复**
- 不是隐藏，是真的修好
- CSS variables + Tailwind dark: prefix 全覆盖

**10.2 Event Detail 价格图**
- 用 Recharts 画事件前后 5 天的价格折线图
- 标注事件发生时间点
- 数据来源: event_outcomes 的 price 字段 + price_cache 表

**10.3 Onboarding 加 Value Preview**
- 欢迎页面展示一个真实 alert 样本
- "Here's what you'll get" — 让用户先看到价值再注册

**10.4 最终 QA Playbook 跑一遍**
- 目标 QA ≥ 95

**验收:** QA ≥ 95, NPS ≥ 8, 付费意愿 YES

---

## 时间线

| Sprint | 内容 | 预估 | 依赖 |
|--------|------|------|------|
| **S6** | Feed 价格修复 | 1-2 天 | 无 |
| **S7** | 单事件 Outcome | 2-3 天 | S6 |
| **S8** | 通知 Fallback | 2-3 天 | 无（可与 S7 并行） |
| **S9** | Search 修复 | 1 天 | 无 |
| **S10** | 收尾打磨 | 2-3 天 | S6-S9 |
| **总计** | | **~2 周** | |

**并行策略:** S6 先做（最关键），S8 和 S9 可以与 S7 并行

---

## 成功标准

达到以下全部指标即可开始收费：

| 指标 | 当前 | 目标 |
|------|------|------|
| QA Score | 93.9 | ≥ 95 |
| NPS | 6/10 | ≥ 8/10 |
| 付费意愿 | NO | YES ($29/mo) |
| 价格数据 | ❌ | ✅ 每张卡片 |
| Outcome 可见 | ❌ | ✅ 每个事件 |
| 通知可用 | ❌ | ✅ 至少 1 channel |
| Search | 🟡 | ✅ 稳定 |
