# Event Radar — 改进方案 & Roadmap v2

**日期:** 2026-03-21
**基于:** QA Final (85/100) + PM/UX/UI/Trader 四视角 Review
**目标:** 从"有趣的 beta" → "值得付费的产品"

---

## 核心诊断

### 产品强项（护城河）
1. **AI Thesis** — 自动生成 Bull/Bear 方向性分析，市面上没有竞品做这个
2. **透明度** — Scorecard 公开准确率 + Source Journey 追踪 pipeline，罕见的诚实
3. **多源聚合** — 15+ 数据源（SEC, FDA, StockTwits, 新闻…），覆盖广
4. **Onboarding** — 30 秒上手，体验流畅（8/10）

### 致命短板（用户不付费的原因）
1. **❌ 没有股价** — "没有温度的天气预报"，trader 看完 alert 还得开 TradingView
2. **❌ 24.4% 命中率** — 比扔硬币还差，公开展示 = 反向营销
3. **❌ 没有闭环** — 告诉你"BEARISH"但永远不告诉你"后来怎么样了"
4. **❌ 留存为零** — 没有推送、没有日报、没有理由每天打开
5. **❌ 基础 bug** — 底部导航遮内容、tabs 坏了、light mode 废了

---

## 改进 Roadmap v2

### 🔴 Sprint 0: Bug 修复（1-2 天）
> 不能带着这些 bug 给任何人看

| # | 问题 | 影响 | 预估 |
|---|------|------|------|
| B1 | 底部导航遮挡页面内容 | 所有页面最后 60px 看不到 | 30min |
| B2 | Event Detail tabs（Evidence/Trust）坏了 | 2/3 tab 不可用 | 2h |
| B3 | Scorecard 移动端永远 skeleton | 移动端核心功能不可用 | 1h |
| B4 | Light mode 半成品 | 切换后不可用 | 隐藏选项 30min / 修好 4h |
| B5 | Feed 切换到 All Events 移动端默认不对 | 首次用户体验差 | 30min |

**交付标准:** QA 分数 ≥ 95/100

---

### 🟠 Sprint 1: 股价集成（3-5 天）
> "交易工具没有价格 = 不可能收费" — PM, Trader, UX 三方共识

**1.1 Event Card 加价格**
- 每张 card 显示：当前价 + 日涨跌幅 + 迷你 sparkline
- 数据源：Yahoo Finance API（免费）或 Polygon.io（$29/月 starter）
- 在 event timestamp 旁显示 "事件发生时价格" vs "当前价格"

**1.2 Event Detail 加价格走势**
- 事件前后 5 天的价格图（K 线或折线）
- 标注事件发生时间点
- 显示 T+1, T+5 涨跌幅

**1.3 "What Happened Next" 闭环**
- 每个 alert 下方小区域："3 天后: AAL -3.2%"
- 用绿色/红色直观标注预测是否正确
- 利用已有的 outcome backfill 数据（processOutcomes 已在跑）

**交付标准:** 每张 event card 有价格，每个 detail 有价格图

---

### 🟡 Sprint 2: 命中率 Reframe + 信任重建（2-3 天）
> 24.4% 不是失败，是 metric 选错了

**2.1 重新定义核心指标**
- 当前："Directional hit rate 24.4%" — 听起来像 AI 很蠢
- 改为：
  - **Event Detection Rate**: "我们捕获了 X% 的市场异动事件"（覆盖率）
  - **Alert Precision**: "HIGH severity alerts 中，X% 确实导致了 >2% 股价波动"（精准率）
  - **方向性准确率** 降为次要指标，加上说明："方向分析仅供参考，核心价值是事件发现速度"

**2.2 Event Detail 信任重建**
- "Pending" / "Insufficient Data" → 隐藏或改文案 "追踪中，5 个交易日后更新"
- Trust section 从页面底部提升到更显眼位置
- 加 "Similar past events" — "上次同类事件后股价…"

**2.3 Scorecard 页面重构**
- Hero 区域：突出 event detection coverage（不是命中率）
- 把 24.4% 放在 "Advanced Stats" 折叠区
- 加上 "最近验证正确的预测" showcase

**交付标准:** 新用户看 Scorecard 的感受从 "AI 不靠谱" → "AI 很透明"

---

### 🟢 Sprint 3: 留存机制（3-5 天）
> Retention 4/10 → 目标 7/10

**3.1 推送通知修复**
- VAPID key 配置 + Service Worker 注册
- 推送被拒后的 fallback：显示 "去浏览器设置打开通知" 教程
- 加 email digest 作为 alternative channel

**3.2 每日 Pre-market Briefing**
- 每天 ET 8:30am 自动生成
- 内容："昨夜/今晨你的 watchlist 发生了 X 件事，最重要的是…"
- 推送到 email + app 内卡片

**3.3 Post-alert Outcome Tracking**
- 每个已有 outcome 数据的 alert，显示 "Result: ✅ Correct (-3.2%) / ❌ Wrong (+1.5%)"
- Watchlist 页面加 "This Week's Alert P&L" 概览
- "如果你按我们的 BEARISH 信号做空，本周…"

**交付标准:** 用户有理由每天早上打开 app

---

### 🔵 Sprint 4: UX 打磨（3-5 天）
> 从 "beta" 感觉 → "production" 感觉

**4.1 Event Detail 重构**
- 修好 Summary/Evidence/Trust 三个 tab
- Summary: 标题 + What Happened + Bull/Bear Thesis + 价格变动 → 30 秒看完
- Evidence: Market Context + Source Details + Risk Factors
- Trust: Source Journey + 历史 pattern + Outcome tracking

**4.2 信息密度优化**
- Feed card 加一行 thesis 摘要（不用点进去就知道为什么 BEARISH）
- Scorecard 默认折叠 bucket tables，只展开 overview
- History 滤镜默认隐藏，按钮展开

**4.3 视觉打磨**
- 底部导航 padding 修复（Sprint 0 做了）
- Light mode 要么做好，要么隐藏入口
- 减少橙色泛滥 — 引入蓝色/青色作为交互色，橙色只用于 severity
- 加 loading 文案替换 skeleton："正在扫描 14 个数据源…"
- WebSocket 连接状态可视化：Live 🟢 / Reconnecting 🟡 / Offline 🔴

**4.4 移动端修复**
- Scorecard 移动端 skeleton 问题（Sprint 0）
- 加 pull-to-refresh 手势
- Feed 默认显示 "My Watchlist"（不是 All Events）

**交付标准:** 视觉打磨度 ≥ 8/10

---

### 🟣 Sprint 5: Smart Feed + 搜索（2-3 天）
> 解决信噪比两极分化

**5.1 Smart Feed 模式**
- 第三个 feed 模式：My Watchlist / All Events / **Smart Feed**
- Smart Feed = 只显示跟用户 watchlist ticker 相关的事件 + AI 判断的 high-impact 事件
- 目标：每天 5-15 条高质量事件（不是 0 条也不是 23,000 条）

**5.2 全局事件搜索**
- 顶部搜索支持搜事件内容（不只是 ticker）
- "Iran sanctions", "Fed rate", "NVDA earnings" 都能搜到
- 搜索结果按相关度排序

**交付标准:** 用户不再觉得 "没东西看" 或 "太多看不完"

---

## 时间线总览

| Sprint | 内容 | 预估 | 交付物 |
|--------|------|------|--------|
| **S0** | Bug 修复 | 1-2 天 | QA ≥ 95 |
| **S1** | 股价集成 | 3-5 天 | Card 有价格 + Detail 有图 |
| **S2** | 命中率 Reframe | 2-3 天 | Scorecard 重构 |
| **S3** | 留存机制 | 3-5 天 | 推送 + 日报 + Outcome |
| **S4** | UX 打磨 | 3-5 天 | 视觉 ≥ 8/10 |
| **S5** | Smart Feed | 2-3 天 | 信噪比解决 |
| **总计** | | **~3-4 周** | 可收费产品 |

---

## 优先级决策框架

**主人需要决定的关键问题：**

1. **定价策略** — $29/月需要股价集成（API 有成本），免费版可以先不加
2. **命中率** — 改模型（慢但根本）vs 改指标（快但表面）vs 两者都做
3. **Light mode** — 修好（4h）vs 先隐藏入口（30min）
4. **推送** — 自建 VAPID（免费但要维护）vs 只做 email digest（更简单）
5. **价格数据源** — Yahoo Finance（免费但不稳定）vs Polygon（$29/月但稳定）vs Alpha Vantage（免费但 rate limit）

---

*这份方案的目标：用 3-4 周的 agent 开发，把 Event Radar 从 "check back in 3 months" 变成 "shut up and take my money"。*
