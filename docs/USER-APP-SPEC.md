# Event Radar — User App 设计方案

## 产品定位

**一句话**：你的 AI 股市情报员 — 重大事件秒级推送，历史 pattern 辅助决策。

**不是什么**：不是 Bloomberg、不是交易平台、不是 K 线图工具。
**是什么**：极简的移动端 alert feed — 像 Twitter timeline 一样刷事件，每条都有 AI 解读 + 历史背景。

---

## 核心功能（V1 MVP）

### 1. 📱 Alert Feed（首页）
- 实时 alert 瀑布流，新事件置顶
- 每条 card 显示：severity 颜色条 | source badge | 标题 | ticker | AI summary | 时间
- 点击展开详情：完整 AI analysis、historical pattern、similar events、source link
- Pull-to-refresh + 自动轮询（30s）
- 按 severity / source / ticker 筛选

### 2. 🔔 Alert 详情页
- AI Enrichment 完整展示：
  - 🔴/🟡/🟢 Action badge
  - Summary（一段话说明发生了什么）
  - Impact（对市场的影响分析）
  - Affected tickers + direction arrows
- Historical Pattern 卡片：
  - Match count + confidence level
  - Avg Alpha T+5 / T+20
  - Win Rate
  - Best/Worst case
  - Top 3 similar events（可点击）
- Source 原文链接
- 用户操作：⭐ Save / 👍👎 Feedback / 🔗 Share

### 3. 👤 用户系统
- 注册 / 登录（Email + password，或 Google OAuth）
- JWT token 认证
- 个人设置页

### 4. 📋 Watchlist 管理
- 添加 / 删除 ticker（搜索 + 自动补全）
- Watchlist tickers 的 alert 优先显示 / 高亮
- 可设置每个 ticker 的通知偏好（all / high+ / critical only）

### 5. ⚙️ 通知设置
- Push notification 开关（需要 service worker）
- Email digest 频率（实时 / 每日摘要 / 关闭）
- Severity 阈值（只推 HIGH+ / 全部）
- 静默时段（比如 23:00-07:00 不推送）

### 6. 🔍 搜索
- 按 ticker / 关键词搜索历史 events
- 结果按时间排序

---

## 页面结构

```
/                     → Alert Feed（首页，需登录）
/event/:id            → Alert 详情页
/login                → 登录
/register             → 注册
/settings             → 用户设置
/settings/watchlist   → Watchlist 管理
/settings/alerts      → 通知偏好
/search               → 搜索
```

移动端 bottom nav：
```
[ 🏠 Feed ]  [ 🔍 Search ]  [ ⚙️ Settings ]
```

---

## 设计原则

### 极简主义
- **黑白为主 + 彩色 severity 条** — alert 唯一的颜色来自 severity
- 大量留白，card 间距充裕
- 字体清晰可读，无装饰性元素
- 一眼看懂，不需要学习

### Mobile-First
- 所有页面先做 375px 宽度
- 单列布局，无侧边栏
- Bottom sheet 代替模态框
- 手势操作（swipe to dismiss、pull to refresh）
- 桌面端自适应放大但保持单列

### 信息密度恰到好处
- Feed card：4 行信息 — source + title + ticker + time
- 详情页：滚动查看，信息分块（AI analysis → Historical → Source）
- 不堆砌数据，每块信息都有明确用途

---

## 技术方案

### 前端
- **React 19 + Vite**（复用 dashboard 的 monorepo 结构）
- **Tailwind CSS**（极简设计 = utility class 最合适）
- **TanStack Query**（数据获取 + 缓存）
- **PWA**（Service Worker + Web Push Notification）
- Package: `packages/web/`

### 后端新增
- **用户系统**：`users` table + bcrypt + JWT
- **Watchlist**：`user_watchlists` table
- **通知偏好**：`user_preferences` table
- **新 API routes**：
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`
  - `GET /api/v1/auth/me`
  - `GET /api/v1/feed` — 用户个性化 alert feed
  - `GET /api/v1/feed/:id` — alert 详情 + enrichment + historical
  - `CRUD /api/v1/watchlist`
  - `GET/PUT /api/v1/preferences`
  - `POST /api/v1/feedback/:eventId`（已有）

### 部署
- Vite build → static files
- Backend serve static at `/`（生产模式）
- 或独立 CDN 部署 + API proxy

---

## 数据流

```
用户打开 App
  ↓
GET /api/v1/feed?severity=HIGH&limit=50
  ↓
Backend 查 pipeline_audit (outcome=delivered) 
  + JOIN events + enrichments + historical
  + 按用户 watchlist 标记优先
  ↓
返回 alert cards
  ↓
用户点击一条
  ↓
GET /api/v1/feed/:id
  ↓
返回完整 enrichment + historical context + similar events
```

---

## DB Schema 新增

```sql
-- 用户
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Watchlist
CREATE TABLE user_watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  notify_level TEXT DEFAULT 'all', -- 'all' | 'high' | 'critical'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ticker)
);

-- 通知偏好
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN DEFAULT true,
  email_digest TEXT DEFAULT 'daily', -- 'realtime' | 'daily' | 'off'
  severity_threshold TEXT DEFAULT 'MEDIUM', -- 最低推送级别
  quiet_start TIME, -- 静默开始 (用户本地时间)
  quiet_end TIME,   -- 静默结束
  timezone TEXT DEFAULT 'America/New_York'
);

-- 用户 feedback（已有，扩展）
-- 已有 feedback 路由，关联 user_id 即可
```

---

## V1 开发顺序

| Phase | 内容 | 预估 |
|-------|------|------|
| **P1** | Auth（register/login/JWT）+ users table | 1 天 |
| **P2** | Alert Feed 页面 + `/api/v1/feed` endpoint | 1 天 |
| **P3** | Alert 详情页（enrichment + historical） | 0.5 天 |
| **P4** | Watchlist CRUD + 高亮 | 0.5 天 |
| **P5** | 通知设置 + PWA push | 1 天 |
| **P6** | 搜索 + 筛选 | 0.5 天 |
| **P7** | 打磨 + 测试 + 部署 | 1 天 |
| **总计** | | **~5.5 天** |

---

## UI 参考风格

极简 alert feed 参考：
- **Linear** 的 issue list — 干净、信息密度高、severity 颜色编码
- **Things 3** — 极简 todo，大量留白
- **Artifact** (by Arc) — 新闻 feed，card 式，一屏看多条

配色方案：
```
Background:  #0A0A0A (near black)
Surface:     #141414
Border:      #1F1F1F
Text:        #FAFAFA
Text Muted:  #737373
Red:         #EF4444
Orange:      #F97316
Yellow:      #EAB308
Green:       #22C55E
Blue:        #3B82F6 (links)
```

---

## 未来扩展（V2+）

- **Morning Briefing** — 每天开盘前自动推送摘要
- **Portfolio Mode** — 连接券商 API 监控持仓
- **Price Alert** — 股价达到目标触发通知
- **Social Feed** — 用户讨论 / 评论区
- **AI Chat** — 问 "NVDA 最近有什么事？" 自动总结
- **历史回看** — 某个 ticker 的完整事件时间线
- **多语言** — 中英文切换
