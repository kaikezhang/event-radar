# Sprint Tracker — Event Radar Improvement Plan

## 执行状态

| Sprint | 状态 | PR(s) | 备注 |
|--------|------|-------|------|
| S0: Bug 修复 | ✅ 完成 | #181 | 底部导航、tabs、scorecard mobile、hide light mode |
| S1: 股价集成 | ✅ 完成 | #182 | Feed API join outcomes + cards + detail + outcome badges |
| S2: 命中率 Reframe | ✅ 完成 | #183 | Scorecard hero 重构 + Advanced Analytics 折叠 + Similar Events |
| S3: 留存机制 | ✅ 完成 | #184 | VAPID push + permission denied UX + daily briefing + outcome stats |
| S4: UX 打磨 | ✅ 完成 | #185 | Thesis preview + blue accent + loading states + WS status + filters |
| S5: Smart Feed | ✅ 完成 | #186 | Smart Feed mode + global event search + empty state |

## 决策记录

- **数据源**: 暂不变，用现有数据（yfinance outcome data, backend 已有价格追踪）
- **Light mode**: 先隐藏入口，后续再修
- **推送**: 自建 VAPID + email digest 双管齐下
- **命中率**: 改指标 + 改模型都做

## Sprint 0: Bug 修复

### Tasks
- [ ] B1: 底部导航 padding fix
- [ ] B2: Event Detail tabs 重构（Summary/Evidence/Trust 分内容）
- [ ] B3: Scorecard 移动端 skeleton fix
- [ ] B4: 隐藏 Light mode toggle
- [ ] B5: Feed 移动端默认 My Watchlist

### 验收标准
- QA 分数 ≥ 95/100
- 所有 5 个 bug 在浏览器中验证修复

## Sprint 1: 股价集成

### Tasks
- [ ] 1.1: Event Card 加当前价格 + 涨跌幅 + sparkline
- [ ] 1.2: Event Detail 加事件前后价格走势图
- [ ] 1.3: "What Happened Next" — 每个 alert 显示 T+1/T+5 涨跌
- [ ] 1.4: 利用已有 outcome backfill 数据填充

### 数据来源
- 后端已有 `price_at_event`, `change_1d`, `change_5d`, `change_20d` 字段
- `processOutcomes()` 每 15 分钟跑一次回填价格数据
- 前端只需要把这些数据展示出来

### 验收标准
- Feed card 有价格信息
- Event detail 有价格图或涨跌数据
- "后来怎样了" 闭环可见

## Sprint 2: 命中率 Reframe

### Tasks
- [ ] 2.1: 新增 "Event Detection Coverage" 指标
- [ ] 2.2: Scorecard 首页重构 — hero 区域突出覆盖率
- [ ] 2.3: 24.4% 命中率降为 "Advanced Stats" 折叠区
- [ ] 2.4: Event Detail 隐藏 "Pending/Insufficient Data"
- [ ] 2.5: 加 "Similar Past Events" 展示

### 验收标准
- 新用户看 Scorecard 感受从 "不靠谱" → "很透明"
- 核心指标让人有信心而不是劝退

## Sprint 3: 留存机制

### Tasks
- [ ] 3.1: 修复 Web Push（VAPID key + Service Worker）
- [ ] 3.2: Push 被拒后 fallback UX（教程 + email 选项）
- [ ] 3.3: 每日 Pre-market Briefing 生成
- [ ] 3.4: Briefing 推送（email + app 内卡片）
- [ ] 3.5: Per-alert outcome badge（✅ Correct / ❌ Wrong）
- [ ] 3.6: Watchlist "This Week's Alert P&L" 概览

### 验收标准
- 用户能收到推送通知
- 每天早上有 briefing
- 能看到预测结果验证

## Sprint 4: UX 打磨

### Tasks
- [ ] 4.1: Event Detail 三 tab 内容分配（S0 B2 的延伸）
- [ ] 4.2: Feed card 加一行 thesis 摘要
- [ ] 4.3: Scorecard bucket tables 默认折叠
- [ ] 4.4: History 滤镜默认隐藏
- [ ] 4.5: 引入蓝色/青色交互色（减少橙色泛滥）
- [ ] 4.6: Loading 文案替代 skeleton
- [ ] 4.7: WebSocket 连接状态可视化
- [ ] 4.8: Pull-to-refresh 手势（移动端）

### 验收标准
- 视觉打磨度 ≥ 8/10（QA review 评分）

## Sprint 5: Smart Feed + 搜索

### Tasks
- [ ] 5.1: Smart Feed 模式（watchlist 相关 + AI high-impact）
- [ ] 5.2: 全局事件搜索（搜内容不只搜 ticker）
- [ ] 5.3: 搜索结果排序优化

### 验收标准
- 用户每天看到 5-15 条相关事件
- 能搜到 "Iran sanctions" 等关键词
