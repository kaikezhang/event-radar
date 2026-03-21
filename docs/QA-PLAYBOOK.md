# Event Radar — QA Playbook

**用途:** AI Agent（CC + gstack /qa）可重复执行的完整产品验证流程
**执行频率:** 每次 Sprint 交付后、每次重大 PR merge 后、或按需执行
**工具:** gstack browse (`$B`) 进行浏览器自动化测试
**环境:** Frontend `http://localhost:5173` | Backend `http://localhost:3001`

---

## 前置检查

```bash
# 1. 确认服务运行
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173  # 应返回 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/v1/feed  # 应返回 200

# 2. 确认 gstack browse 可用
$B goto http://localhost:5173
$B snapshot -i
```

如果任一服务不可用，停止测试并报告。

---

## 测试用例

### TC-01: 新用户 Onboarding 流程

**模拟：** 一个从未使用过产品的新用户首次访问

```
步骤:
1. 清除 localStorage: $B js "localStorage.clear()"
2. 刷新页面: $B goto http://localhost:5173
3. 验证: 应跳转到 /onboarding，显示欢迎页面
4. 点击 "Get started"
5. 验证: 进入 ticker 选择页面，显示热门 ticker、sector packs
6. 选择至少 3 个 ticker（如 NVDA, AAPL, META）
7. 验证: 计数器显示 "3 selected"，"Continue" 按钮可点
8. 点击 Continue → 进入通知设置
9. 点击 "Maybe later" 跳过通知
10. 验证: 进入完成页面，显示 Scorecard 说明
11. 点击完成 → 跳转到 Feed
12. 验证: localStorage 有 "onboardingComplete" key
```

**通过标准:** 全流程无报错，最终到达 Feed 页面，watchlist 包含选择的 ticker

---

### TC-02: Feed 三种模式

**模拟：** 用户切换 Feed 的三种视图模式

```
步骤:
1. 访问 http://localhost:5173
2. 验证: Feed 加载完成，显示事件卡片（非 skeleton）
3. 检查 feed 模式选择器，应有 3 个选项: Smart Feed / My Watchlist / All Events
4. 切换到 "Smart Feed"
5. 验证: 显示精选事件（watchlist 相关 + CRITICAL + 可信源 HIGH）
6. 如果无事件: 应显示 "Quiet day" 空状态
7. 切换到 "My Watchlist"
8. 验证: 只显示 watchlist ticker 相关事件
9. 切换到 "All Events"
10. 验证: 显示所有事件，数量明显多于前两个模式
```

**通过标准:** 三种模式切换正常，内容符合预期，无 JS 错误

---

### TC-03: Feed 卡片信息完整性

**模拟：** 验证每张事件卡片展示完整信息

```
步骤:
1. 在 Feed 页面，找到一张有 ticker 的事件卡片
2. 验证卡片包含:
   - [ ] 严重度标签（CRITICAL/HIGH/MEDIUM/LOW）
   - [ ] 事件标题
   - [ ] 方向性标签（BEARISH ▼ / BULLISH ▲）
   - [ ] Thesis 摘要预览（一行文字说明为什么 bearish/bullish）
   - [ ] 来源标签（via CNBC / via SEC Filing 等，非 raw key）
   - [ ] Ticker chips（$NVDA, $AAPL）
   - [ ] 时间戳（"2h ago", "1d ago"）
   - [ ] 事件价格（如果有 outcome 数据）："$180.40"
   - [ ] 涨跌幅（如果有）："▼ -3.2% (1d)" 红色 或 "▲ +2.1%" 绿色
   - [ ] Outcome badge: ✅ / ❌ / ⏳（如果有方向预测）
3. 验证: source 名称是用户友好的（不应出现 "dummy", "test", "internal"）
```

**通过标准:** 卡片信息完整，无 raw 内部数据泄露

---

### TC-04: Event Detail 页面（Summary tab）

**模拟：** 用户点击事件查看详情

```
步骤:
1. 在 Feed 点击一个有 ticker 的事件卡片
2. 验证: 跳转到 /event/:id，显示事件详情
3. 验证 Summary tab 包含:
   - [ ] 事件标题 + 严重度 + 方向性
   - [ ] "What Happened" / Catalyst Summary
   - [ ] Bull vs Bear Thesis（分列或分区显示）
   - [ ] "📊 What Happened Next"（价格变动，如果有 outcome 数据）
   - [ ] "📜 Similar Past Events"（同 ticker 历史事件，最多 3 个）
4. 验证: 如果 outcome 全部 pending，显示 "Outcome tracking in progress" 而非一堆 "Pending"
```

**通过标准:** Detail 页面内容完整，无重复渲染，pending 数据优雅处理

---

### TC-05: Event Detail 页面（Evidence + Trust tabs）

**模拟：** 用户切换详情页 tab

```
步骤:
1. 在 Event Detail 页面
2. 点击 "Evidence" tab
3. 验证: 显示与 Summary 不同的内容（Market Context, Source Details, Risk Factors）
4. 点击 "Trust" tab
5. 验证: 显示与前两个 tab 不同的内容（Source Journey, Verification, Outcome tracking）
6. 验证: 无 UI 重复渲染（不应出现两个 Back 按钮或两个 tab bar）
7. 点击 "Summary" tab 回到第一个 tab
8. 验证: 内容正确回到 Summary 视图
```

**通过标准:** 三个 tab 各有不同内容，切换无 bug

---

### TC-06: Scorecard 页面

**模拟：** 用户查看 AI 表现评分卡

```
步骤:
1. 导航到 /scorecard
2. 验证 Hero 区域:
   - [ ] 主指标: "X Events Detected"（大数字，不是 hit rate）
   - [ ] 次要指标: Outcomes Tracked, Active Sources, 等
   - [ ] 不应该在首屏突出显示 "24.4% hit rate"
3. 验证 Advanced Analytics:
   - [ ] 默认折叠
   - [ ] 点击展开后显示详细命中率、T+5/T+20 统计
   - [ ] 包含 disclaimer 文案
4. 验证 Bucket Tables:
   - [ ] 默认折叠（只显示标题 + 摘要）
   - [ ] 点击展开后显示完整表格
   - [ ] 不应出现 "DUMMY" 源
5. 验证图表:
   - [ ] Source Accuracy 图表正常渲染
   - [ ] Rolling Accuracy Trend 正常渲染
6. 切换时间窗口（30d / 90d / All）
7. 验证: 数据随窗口变化更新
```

**通过标准:** Scorecard 加载正常，指标展示合理，无 "dummy" 数据

---

### TC-07: Scorecard 移动端

```
步骤:
1. 设置 viewport 375x812: $B viewport 375x812
2. 导航到 /scorecard
3. 验证: 页面完整加载，不卡在 skeleton
4. 验证: 图表适应窄屏，不溢出
5. 恢复 viewport: $B viewport 1280x720
```

**通过标准:** 移动端 scorecard 正常加载和显示

---

### TC-08: Watchlist 管理

**模拟：** 用户管理 watchlist ticker

```
步骤:
1. 导航到 /watchlist
2. 验证: 显示当前 watchlist 的 ticker 列表
3. 验证: 有周统计 "This week: X alerts, Y correct (Z%)"
4. 按 "/" 或 "⌘K" 打开搜索
5. 搜索一个 ticker（如 "TSLA"）
6. 添加到 watchlist
7. 验证: watchlist 更新，新 ticker 出现
8. 移除一个 ticker
9. 验证: ticker 从列表消失
```

**通过标准:** Watchlist 增删正常，统计数据显示

---

### TC-09: 全局搜索（Ticker + Event）

**模拟：** 用户搜索 ticker 和事件内容

```
步骤:
1. 按 "/" 或 "⌘K" 打开搜索
2. 验证: 搜索弹窗出现，有 "Tickers" 和 "Events" tab
3. 在 Tickers tab 搜索 "NVDA"
4. 验证: 显示 ticker 搜索结果
5. 切换到 Events tab
6. 搜索 "SEC filing"
7. 验证: 显示事件搜索结果（带严重度 badge + 标题 + 日期）
8. 点击一个搜索结果
9. 验证: 导航到对应的 event detail 页面
10. 按 Escape 关闭搜索
```

**通过标准:** 双 tab 搜索正常，事件搜索返回相关结果

---

### TC-10: History 页面 + 滤镜

**模拟：** 用户浏览历史事件并使用筛选

```
步骤:
1. 导航到 /history
2. 验证: 历史事件加载，显示总数
3. 验证: 滤镜默认折叠，只显示 "Filters" 按钮
4. 点击 "Filters" 展开
5. 验证: 显示筛选选项（severity, source, date range, ticker）
6. 选择一个 severity filter（如 HIGH）
7. 验证: 结果更新，显示 filter chip
8. 验证: "Filters (1)" badge 显示活跃筛选数
9. 清除筛选
10. 验证: 结果恢复
```

**通过标准:** History 加载正常，滤镜工作，折叠/展开正常

---

### TC-11: Settings 页面

**模拟：** 用户查看和修改设置

```
步骤:
1. 导航到 /settings
2. 验证: 不应有 Light/Dark 主题切换（已隐藏）
3. 验证: Push Alerts 区域:
   - 如果权限未请求: 显示 "Enable push alerts" 按钮
   - 如果权限被拒: 显示分步恢复指引（针对当前平台: Desktop/iOS/Android）
   - 不应只显示 "PERMISSION: DENIED" 无引导
4. 验证: 其他设置项正常显示（通知预算、声音、Audio Squawk 等）
```

**通过标准:** Settings 页面完整，push UX 有引导

---

### TC-12: 键盘快捷键

**模拟：** Power user 使用键盘操作

```
步骤:
1. 在 Feed 页面
2. 按 "j" → 选中下一个事件卡片（橙色左边框高亮）
3. 按 "k" → 选中上一个
4. 按 "Enter" → 打开事件详情
5. 按 "Escape" → 返回 Feed
6. 按 "?" → 弹出键盘快捷键帮助弹窗
7. 按 Escape 关闭帮助
8. 按 "/" → 打开搜索弹窗
9. 按 Escape 关闭搜索
```

**通过标准:** 所有快捷键正常工作

---

### TC-13: WebSocket 连接状态

**模拟：** 验证实时连接状态指示

```
步骤:
1. 在 Feed 页面
2. 查看页面顶部的连接状态指示器
3. 验证: 显示 "Live" (🟢) / "Reconnecting" (🟡) / "Offline" (🔴) 之一
4. 验证: 指示器有 tooltip 和 accessible label
5. 检查 console: WebSocket 重连不应频繁于 60 秒一次（有 backoff）
```

**通过标准:** 状态指示器存在且反映实际连接状态

---

### TC-14: Daily Briefing 卡片

**模拟：** 验证每日摘要功能

```
步骤:
1. 清除 briefing dismiss 状态: $B js "localStorage.removeItem('lastBriefingDismissed')"
2. 刷新 Feed
3. 验证: Feed 顶部显示 Daily Briefing 卡片
4. 验证卡片包含:
   - [ ] 日期标题 "📰 Daily Briefing — {today}"
   - [ ] 24h 事件数
   - [ ] 最重要事件标题
   - [ ] 预测准确率（如果有 outcome 数据）
   - [ ] 区分 watchlist tab vs all tab 的 scope 标签
5. 点击 dismiss/关闭按钮
6. 验证: 卡片消失
7. 刷新页面
8. 验证: 卡片不再显示（同一天已 dismiss）
```

**通过标准:** Briefing 卡片显示正确信息，dismiss 持久化

---

### TC-15: 底部导航 + 页面内容不被遮挡

**模拟：** 验证所有页面的底部内容可见

```
步骤:
对每个页面 (/feed, /watchlist, /scorecard, /history, /settings):
1. 导航到该页面
2. 滚动到页面最底部
3. 验证: 所有内容在底部导航栏上方可见，不被遮挡
4. 验证: 底部导航的 5 个 tab 图标清晰可点
```

**通过标准:** 所有页面底部内容完全可见

---

### TC-16: 移动端响应式

**模拟：** 验证移动端（375px）体验

```
步骤:
1. $B viewport 375x812
2. 测试每个页面:
   - Feed: 卡片堆叠正常，filter chips 换行
   - Event Detail: 全屏显示，Back 按钮可用
   - Scorecard: 数据加载（非 skeleton 卡住）
   - Watchlist: 列表正常显示
   - History: 滤镜折叠，事件列表正常
   - Settings: 各区域正常显示
3. 验证: 底部导航图标可识别
4. $B viewport 1280x720 恢复
```

**通过标准:** 所有页面在 375px 宽度下正常显示和交互

---

### TC-17: Console 错误检查

**模拟：** 全局检查 JavaScript 错误

```
步骤:
1. 逐页访问所有路由: /, /scorecard, /watchlist, /history, /settings, /onboarding
2. 在每个页面执行: $B console --errors
3. 验证: 无 JS 错误（WebSocket 连接 warning 可接受）
4. 验证: 无 401/403/500 HTTP 错误
```

**通过标准:** 无 JS 运行时错误，无 HTTP 错误

---

### TC-18: 源名称一致性

**模拟：** 验证所有 UI 中的数据源名称

```
步骤:
1. 在 Feed filter dropdown 中查看所有源名称
2. 在 History 页面 source filter 中查看
3. 在 Scorecard source buckets 中查看
4. 验证:
   - [ ] 不应出现 "dummy", "test", "internal"
   - [ ] 所有源应为用户友好名称（如 "SEC Filing" 而非 "sec-edgar"）
   - [ ] 三处的源名称应一致
```

**通过标准:** 全平台源名称一致，无内部名称泄露

---

## 评分标准

| 等级 | 分数 | 含义 |
|------|------|------|
| 🟢 PASS | 100 | 全部 TC 通过 |
| 🟢 SHIP READY | 90-99 | 仅 cosmetic 问题 |
| 🟡 CONDITIONAL | 80-89 | 有 medium 问题，可选择上线 |
| 🔴 NOT READY | <80 | 有 high/critical 问题 |

**计分方式:**
- 每个 TC 通过 = 满分（100/18 ≈ 5.6 分）
- TC 部分通过 = 按通过比例折算
- Critical bug 扣 10 分
- High bug 扣 5 分
- Medium bug 扣 2 分
- Low/Cosmetic bug 扣 1 分

---

## 输出格式

测试完成后，输出报告到 `docs/reviews/qa-playbook-run-YYYY-MM-DD.md`，包含：

1. **Summary**: 总分 + PASS/CONDITIONAL/NOT READY 状态
2. **TC Results Table**: 每个 TC 的通过/失败状态 + 简短说明
3. **Bug List**: 发现的 bug（severity + description + repro steps）
4. **Screenshots**: 关键页面截图（存到 `.gstack/qa-reports/screenshots/`）
5. **Comparison**: 与上次 QA 结果对比（分数变化 + 新增/修复的 bug）
6. **Product Feedback**: 从用户体验角度给出 3-5 条改进建议（不只是 bug）
