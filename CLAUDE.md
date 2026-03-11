# Event Radar

Real-time event-driven trading intelligence platform. Monitors 30+ sources (SEC filings, political social media, macro data), classifies events with AI, and pushes alerts to iOS/Telegram/Discord/Dashboard.

## Tech Stack

TypeScript monorepo (Turborepo). Backend: Fastify. Frontend: Next.js 15 + shadcn/ui + Tailwind. DB: PostgreSQL. Testing: Vitest + Playwright. SEC parsing: Python microservice (FastAPI + edgartools).

## Structure

```
packages/shared/     — types, interfaces, schemas (zod)
packages/backend/    — Fastify server, scanners, pipeline, delivery
packages/frontend/   — Next.js 15 dashboard
packages/sec-service/— Python FastAPI microservice
```

## Commands

- `turbo build` — build all packages
- `turbo test` — run all tests (Vitest)
- `turbo lint` — ESLint check
- `docker compose up` — start all services locally

## Git Workflow

- 完成任务后：创建新分支 → commit → push → 创建 PR → 由 master/owner merge 到 main
- 禁止直接 push 到 main
- **严禁 merge PR！** 你只负责创建 PR 和修改代码，merge 由晚晚（orchestrator）执行
- 不要运行 `gh pr merge`、`git merge` 到 main、或任何合并操作
- 修改 md/docs 可直接 commit 到 main

## Key Constraints

- Use zod for all validation. Result<T,E> pattern for errors, don't throw.
- Env vars via `@t3-oss/env-core`. Never hardcode secrets.
- One scanner per file. Scanners only extract data — no classification logic.
- Virtual list: @tanstack/virtual (NOT AG Grid). DB: PostgreSQL (NOT SQLite).
- Event bus interface: EventEmitter now, Redis Streams later. Don't couple to implementation.

## Verification

After any change: `turbo build && turbo test && turbo lint` must all pass.

## Tasks

Read `tasks.md` for current task and development plan.

## Current Task: P4.3.4 — 自适应分类调整

### Goal
基于 P4.3.1-3 收集的准确率数据和用户反馈，实现自适应分类调整：自动调整规则引擎权重，low-confidence 事件优先送 LLM 重分类。

### Requirements

1. **Adaptive Classification Service** (`packages/backend/src/services/adaptive-classifier.ts`)
   - `getSourceWeights(): Promise<SourceWeights>` — 获取每个 source 的当前权重
     - 默认权重 1.0，基于准确率数据动态调整
     - 权重范围 0.1 - 2.0
   - `recalculateWeights(): Promise<SourceWeights>` — 重新计算权重
     - 基于 `ClassificationAccuracyService.getAccuracyStats({ groupBy: 'source' })`
     - 准确率高的 source → 提高权重，准确率低的 → 降低权重
     - 公式: `newWeight = clamp(baseWeight * (sourceAccuracy / avgAccuracy), 0.1, 2.0)`
     - 最少需要 20 个评估样本才调整（否则保持默认）
   - `shouldReclassify(event): boolean` — 判断是否需要 LLM 重分类
     - confidence < 0.5 → 必须重分类
     - confidence 0.5-0.7 且该 source 准确率 < 0.6 → 重分类
     - 用户 feedback = 'incorrect' → 重分类
   - `getReclassificationQueue(limit): Promise<Event[]>` — 待重分类事件队列
     - 按优先级排序：用户标记错误 > low confidence > low source accuracy

2. **Weight Adjustment History** (`packages/backend/src/services/weight-history.ts`)
   - `recordAdjustment(weights, reason): Promise<void>` — 记录权重变更
   - `getHistory(limit): Promise<WeightAdjustment[]>` — 变更历史
   - 用于审计和回滚

3. **Types** (`packages/shared/src/schemas/adaptive-types.ts`)
   ```typescript
   export const SourceWeightsSchema = z.object({
     weights: z.record(z.string(), z.number().min(0.1).max(2.0)),
     updatedAt: z.string(),
     sampleSize: z.number(),
   });

   export const ReclassificationReasonSchema = z.enum([
     'low_confidence',
     'low_source_accuracy',
     'user_feedback_incorrect',
   ]);

   export const ReclassificationItemSchema = z.object({
     eventId: z.string(),
     reason: ReclassificationReasonSchema,
     confidence: z.number(),
     sourceAccuracy: z.number().nullable(),
     priority: z.number(), // higher = more urgent
   });

   export const WeightAdjustmentSchema = z.object({
     id: z.string(),
     previousWeights: z.record(z.string(), z.number()),
     newWeights: z.record(z.string(), z.number()),
     reason: z.string(),
     createdAt: z.string(),
   });
   ```

4. **Database Schema**
   - `source_weights` 表: id, source, weight, sample_size, updated_at
   - `weight_adjustments` 表: id, previous_weights (JSON), new_weights (JSON), reason, created_at
   - `reclassification_queue` 表: id, event_id (FK), reason, priority, status ('pending'|'done'), created_at
   - 用 drizzle-orm schema 定义

5. **API Endpoints**
   - `GET /api/v1/adaptive/weights` — 当前 source 权重
   - `POST /api/v1/adaptive/recalculate` — 触发权重重算
   - `GET /api/v1/adaptive/queue?limit=20` — 重分类队列
   - `GET /api/v1/adaptive/history?limit=20` — 权重调整历史
   - 所有 endpoints 需要 API key auth

6. **Pipeline Integration**
   - 分类完成时 → 检查 `shouldReclassify()` → 如果需要加入队列
   - 每 500 个新 outcome → 自动 `recalculateWeights()`
   - 权重变更 → emit `weights:updated` 到 event bus

7. **Tests** (≥12 tests)
   - 权重计算公式正确
   - 样本不足时保持默认权重
   - 权重 clamp 在 0.1-2.0
   - shouldReclassify 各条件判断
   - 重分类队列优先级排序
   - 权重历史记录
   - API auth 验证
   - 空数据处理
   - 权重重算触发条件

### Files to create/modify
- `packages/shared/src/schemas/adaptive-types.ts` — Zod schemas + types
- `packages/shared/src/index.ts` — export
- `packages/backend/src/db/schema.ts` — 新表
- `packages/backend/src/services/adaptive-classifier.ts` — 核心自适应逻辑
- `packages/backend/src/services/weight-history.ts` — 权重历史
- `packages/backend/src/routes/adaptive.ts` — API
- `packages/backend/src/app.ts` — 注册 routes
- `packages/backend/src/__tests__/adaptive-classifier.test.ts`
- `packages/backend/src/__tests__/weight-history.test.ts`

### Dependencies
- P4.3.1 classification accuracy service（准确率数据）
- P4.3.2 direction analytics（方向准确率）
- P4.3.3 user feedback（用户反馈）

### Verification
- `pnpm build && pnpm --filter @event-radar/backend lint` must pass
- All tests pass
- Create branch `feat/adaptive-classifier`, commit, push, create PR to main
- **DO NOT merge the PR**
   - 按事件类型统计
   - 时间窗口过滤 (7d/30d/90d)
   - Confidence calibration 计算
   - F1 score 计算
   - Pipeline 集成（分类完成自动记录）
   - API 响应格式

### Files to create/modify
- `packages/shared/src/schemas/accuracy-types.ts` — Zod schemas + types
- `packages/shared/src/index.ts` — export
- `packages/backend/src/db/schema.ts` — 新增表
- `packages/backend/src/services/classification-accuracy.ts` — 核心逻辑
- `packages/backend/src/routes/accuracy.ts` — API routes
- `packages/backend/src/app.ts` — 注册 routes
- `packages/backend/src/__tests__/classification-accuracy.test.ts`

### Dependencies
- P4.2 outcome tracker（价格变化数据）

### Verification
- `pnpm build && pnpm --filter @event-radar/backend lint` must pass
- All tests pass
- Create branch `feat/classification-accuracy`, commit, push, create PR to main

3. **CI/CD** (GitHub Actions)
   - Auto build + test on PR
   - Deploy to cloud (optional)

### Verification
All tests pass.

**Goal**: TradingView chart with event markers overlay.

### Requirements

1. **Chart Component**
   - Use `@tradingview/lightweight-charts` npm package
   - Candlestick chart for selected ticker
   - Default timeframe: 1 day (D)
   - Time range: last 30 days
   - Dark theme (matching dashboard)

2. **Ticker Selection**
   - Dropdown or input to select ticker
   - Auto-populate from recent events
   - Default: AAPL

3. **Price Data**
   - Fetch from Yahoo Finance API
   - Cache for 5 minutes
   - Fallback: "No data available"

4. **Event Markers**
   - Overlay markers: green up = positive, red down = negative
   - Click marker → show event tooltip
   - Click event → open detail panel

5. **Layout**
   - Place chart below event list
   - Minimum height: 400px

### Files to create
- `packages/frontend/src/components/price-chart.tsx`
- `packages/frontend/src/hooks/use-price-data.ts`

### Verification
`turbo build` must pass.
   - Ticker(s) displayed prominently
   - Published timestamp (relative time, e.g., "5 min ago")
   - Full headline
   - Summary if available

3. **Classification Section**
   - Show classification result (severity + tags)
   - AI reasoning (if LLM classified)
   - Confidence score bar (0-100%)
   - Rule matches list (if rule-based)

4. **Source Link**
   - "View Original" button linking to source
   - Open in new tab
   - Source icon as favicon

5. **Similar Events**
   - Query backend for similar events (same ticker, similar tags)
   - Show up to 10 similar events
   - Limit to last 7 days

6. **Actions**
   - "Copy Event JSON" button
   - "Share" button (copy URL)
   - Star/Mark as Important (localStorage)

### Files to create/modify
- `packages/frontend/src/components/event-detail-panel.tsx` - main panel
- `packages/backend/src/routes/events.ts` - add GET /events/:id/similar endpoint
- `packages/frontend/src/hooks/use-event-detail.ts` - fetch hook

### Verification
`turbo build && turbo test && turbo lint` must pass.

### Requirements

1. **WebSocket Connection**
   - Backend: Add `/ws/events` endpoint in Fastify
   - Frontend: Connect to WebSocket, handle reconnect on disconnect
   - Protocol: JSON messages with event data
   - Auth: Pass API key in WebSocket handshake query param

2. **Event List Component**
   - Use `@tanstack/react-virtual` for virtual scrolling
   - Show: severity badge, source icon, ticker, headline, direction, timestamp
   - Click event → open detail panel (P2.3)
   - Max 500 events in memory (LRU eviction)

3. **Filter Bar**
   - Filter by tier (Tier 1/2/3)
   - Filter by severity (CRITICAL/HIGH/MEDIUM/LOW)
   - Filter by source (SEC, Political, Newswire)
   - Filter by ticker (text input with autocomplete)
   - Saved filter presets (localStorage)

4. **Real-time Updates**
   - New events appear at top with highlight animation
   - Sound alerts for CRITICAL/HIGH severity (configurable)
   - Browser notifications if tab not focused (with permission)

5. **Backend WebSocket Server**
   - Add `packages/backend/src/plugins/websocket.ts`
   - Broadcast new events to all connected clients
   - Heartbeat every 30s to detect stale connections

### Files to create/modify
- `packages/backend/src/plugins/websocket.ts` - WebSocket server
- `packages/backend/src/app.ts` - register WS plugin
- `packages/frontend/src/components/event-list.tsx` - virtual list
- `packages/frontend/src/components/filter-bar.tsx` - filters
- `packages/frontend/src/hooks/use-events-websocket.ts` - WS client hook

### Verification
`turbo build && turbo test && turbo lint` must pass.

### Requirements

1. **Next.js 15 Setup** — Already exists in packages/frontend
   - Verify it's using App Router (not Pages Router)
   - Add shadcn/ui (follow shadcn CLI init)
   - Add Tailwind CSS (should already be configured)

2. **Theme Configuration**
   - Dark theme as default (next-themes)
   - Custom colors for severity: CRITICAL=red, HIGH=orange, MEDIUM=yellow, LOW=green
   - Font: Inter + JetBrains Mono for code

3. **Layout Components**
   - Sidebar navigation (collapsible)
   - Header with search, filters, user menu
   - Main content area with panels

4. **Authentication**
   - Simple API key auth (enter key in UI to access dashboard)
   - Store API key in localStorage
   - Show login screen if no valid key

5. **Environment Setup**
   - Add `NEXT_PUBLIC_API_URL` env var
   - Add `NEXT_PUBLIC_API_KEY` (optional, or prompt user)

6. **Initial Pages**
   - `/` - Login/landing page
   - `/dashboard` - Main dashboard (placeholder for now)

### Files to modify
- `packages/frontend/` - configure shadcn, theme
- `packages/frontend/src/app/page.tsx` - landing/login page
- `packages/frontend/src/app/dashboard/page.tsx` - placeholder dashboard

### Verification
`turbo build` must pass. Frontend dev server should start without errors.

### Requirements

1. **GET /events endpoint** — List events with filters
   - Query params: `ticker`, `type`, `severity`, `dateFrom`, `dateTo`, `limit` (default 50, max 200), `offset`
   - Return: array of event summaries (not full details)
   - Sort: by `publishedAt` descending (newest first)

2. **GET /events/:id endpoint** — Full event detail
   - Return complete event including classification reasoning
   - 404 if not found

3. **GET /health endpoint** — System status
   - Return: DB connection status, scanner statuses, uptime, version
   - Already exists (P1A.4) - verify and extend if needed

4. **API Key Authentication**
   - Header: `X-API-Key: <key>`
   - Env var: `API_KEY` (generate random string if not set)
   - Return 401 if missing/invalid
   - Apply to /events and /events/:id endpoints
   - /health can be public (no auth)

5. **Request Validation**
   - Use fastify's schema validation for all query params
   - Validate ticker format (1-5 uppercase letters)
   - Validate severity enum
   - Validate date format (ISO 8601)

6. **Tests** (≥10 new tests)
   - GET /events without auth → 401
   - GET /events with valid API key → 200
   - GET /events filter by ticker
   - GET /events filter by severity
   - GET /events filter by date range
   - GET /events/:id not found → 404
   - GET /events/:id success
   - GET /health public (no auth required)
   - Invalid query params → 400

### Files to create/modify
- `packages/backend/src/routes/events.ts` — add events endpoints
- `packages/backend/src/plugins/auth.ts` — API key plugin
- Update `packages/backend/src/app.ts` to register routes and auth plugin
- `packages/backend/src/__tests__/events-api.test.ts` — extend existing tests

### Verification
`turbo build && turbo test && turbo lint` must pass.

### Requirements

1. **Confidence Score System** — Add confidence to classification output
   - Add `confidence: number (0-1)` field to `Event` type
   - Add `confidenceLevel: 'high' | 'medium' | 'low' | 'unconfirmed'` derived field
   - Rules-based classification: default 0.8, adjust based on rule strength
   - LLM classification: use model's confidence if available, else default 0.7

2. **Unconfirmed Badge UI** — Frontend component for low-confidence events
   - Add `src/frontend/components/confidence-badge.tsx`
   - Show "🔍 Unconfirmed" for confidence < 0.5
   - Show "⚠️ Medium" for confidence 0.5-0.7
   - Show "✅ Confirmed" for confidence >= 0.7
   - Tooltip showing confidence score and factors

3. **Classification Metrics Tracking** — Log classification decisions for analysis
   - Add `src/pipeline/classification-metrics.ts`
   - Track: total classified, by severity, by source, average confidence
   - Emit metrics to logs every 100 events

4. **Rule Refinement** — Improve existing classification rules
   - Review `src/pipeline/default-rules.ts`
   - Add more specific patterns for HIGH severity:
     - M&A: "acquire", "acquisition", "merge", "merger", "buyout"
     - Earnings: "Q1/Q2/Q3/Q4 earnings", "EPS", "revenue beat", "guidance raise"
     - FDA: "FDA approval", "clinical trial", "Phase 1/2/3", "NDA"
   - Add MEDIUM patterns:
     - Executive: "appoint", "resign", "promote", "CEO", "CFO"
     - Partnership: "partner with", "strategic alliance", "joint venture"

5. **Scanner Health Monitoring** — Track scanner uptime and error rates
   - Add scanner heartbeat tracking in database
   - Add `GET /api/scanners/status` endpoint
   - Return: scanner name, last success, error count, status (healthy/degraded/down)
   - Alert if scanner hasn't succeeded in 5 minutes

6. **Tests** (≥8 new tests)
   - Confidence score calculation from rules
   - Confidence score from LLM response
   - Confidence badge component rendering
   - Classification metrics logging
   - Scanner health endpoint

### Files to create/modify
- `packages/shared/src/types/event.ts` — add confidence fields
- `packages/backend/src/pipeline/classifier.ts` — add confidence scoring
- `packages/backend/src/pipeline/classification-metrics.ts` — new
- `packages/backend/src/routes/scanners.ts` — add health endpoint
- `packages/frontend/src/components/confidence-badge.tsx` — new
- `packages/backend/src/__tests__/confidence.test.ts` — new

### Verification
`turbo build && turbo test && turbo lint` must pass.

**Goal**: Add RSS-based scanners for the 3 major corporate newswires: PR Newswire, BusinessWire, GlobeNewswire.

### Architecture

Unlike Tier 2 (browser scraping), these sources provide proper RSS feeds — much simpler and more reliable. Each scanner polls an RSS feed, parses entries, extracts ticker/company info, and emits `RawEvent`.

### Requirements

1. **RSS parser utility** — `src/scanners/rss/rss-parser.ts`
   - Wrap `rss-parser` npm package
   - Generic RSS/Atom feed fetcher with timeout (10s) and retry (3x with backoff)
   - Returns parsed items with: title, link, pubDate, content/description, guid
   - Handle malformed feeds gracefully (Result pattern)

2. **PR Newswire Scanner** — `src/scanners/pr-newswire-scanner.ts`
   - Feed URL: `https://www.prnewswire.com/rss/all-news-releases.rss`
   - Poll interval: 60s
   - Extract: headline, company name, ticker (from title/body patterns like `(NASDAQ: AAPL)`)
   - Emit `RawEvent` with `source: 'pr-newswire'`, `type: 'press-release'`
   - Dedup by guid

3. **BusinessWire Scanner** — `src/scanners/businesswire-scanner.ts`
   - Feed URL: `https://feed.businesswire.com/rss/home/?rss=G1QFDERJXkJeEFpRWg==`
   - Poll interval: 60s
   - Same extraction logic as PR Newswire
   - Emit `RawEvent` with `source: 'businesswire'`, `type: 'press-release'`

4. **GlobeNewswire Scanner** — `src/scanners/globenewswire-scanner.ts`
   - Feed URL: `https://www.globenewswire.com/RSSFeed/country/United%20States/feedTitle/GlobeNewswire%20-%20News%20Releases%20for%20USA`
   - Poll interval: 60s
   - Emit `RawEvent` with `source: 'globenewswire'`, `type: 'press-release'`

5. **Ticker extraction utility** — `src/scanners/rss/ticker-extractor.ts`
   - Regex patterns to extract stock tickers from press release text
   - Match patterns: `(NYSE: XYZ)`, `(NASDAQ: XYZ)`, `(TSX: XYZ)`, `$XYZ`
   - Return array of found tickers
   - Handle edge cases: multiple tickers, false positives (common words like $USD)

6. **Press release classification rules** — add to `src/pipeline/default-rules.ts`
   - Press release + merger/acquisition keywords → HIGH
   - Press release + earnings/guidance keywords → HIGH
   - Press release + FDA/drug approval keywords → HIGH
   - Press release + executive change keywords → MEDIUM
   - Press release + partnership keywords → MEDIUM
   - Default press release → LOW

7. **Scanner registration**
   - Register all 3 in scanner registry
   - Env vars: `PR_NEWSWIRE_ENABLED`, `BUSINESSWIRE_ENABLED`, `GLOBENEWSWIRE_ENABLED` (all default true)

8. **Tests** (≥12 new tests)
   - RSS parser: valid feed, malformed feed, timeout, empty feed
   - Ticker extractor: NYSE pattern, NASDAQ pattern, $TICKER pattern, multiple tickers, no tickers, false positives
   - Each scanner: parse mock RSS XML → emit correct RawEvents
   - Press release classification rules
   - DO NOT make real network calls — use mock RSS XML fixtures

### Dependencies to add (packages/backend)
- `rss-parser`

## Current Task: P4.1.1 — 事件相似度匹配算法

### Goal
Build event similarity matching that groups related events across different sources. Given a new event, find similar/related events based on ticker overlap, time proximity, and content similarity.

### Similarity Service (`event-similarity.ts`)
- Create `packages/backend/src/services/event-similarity.ts`
- Methods:
  - `findSimilarEvents(eventId: string, options?: SimilarityOptions): Promise<SimilarEvent[]>` — find similar events for a given event
  - `computeSimilarity(eventA: Event, eventB: Event): SimilarityScore` — pairwise similarity score
  - `buildSimilarityIndex(): void` — pre-compute similarity clusters (optional, for batch processing)
- Similarity factors (weighted):
  - **Ticker overlap** (weight 0.4): shared tickers between events → Jaccard index
  - **Time proximity** (weight 0.3): events within 30min → high score, decays exponentially
  - **Content similarity** (weight 0.3): keyword overlap in headlines/summaries → cosine similarity on TF-IDF or simple Jaccard on extracted keywords
- Threshold: similarity >= 0.5 to be considered "similar"

### Types (add to shared)
```typescript
export interface SimilarityOptions {
  maxResults?: number;       // default 10
  timeWindowMinutes?: number; // default 60
  minScore?: number;         // default 0.5
  sameTickerOnly?: boolean;  // default false
}

export interface SimilarEvent {
  eventId: string;
  score: number;             // 0-1 composite similarity
  tickerScore: number;       // 0-1
  timeScore: number;         // 0-1
  contentScore: number;      // 0-1
  event: Event;              // the similar event
}

export interface SimilarityScore {
  composite: number;
  ticker: number;
  time: number;
  content: number;
}
```

### API Endpoints
- `GET /api/v1/events/:id/similar?limit=10&timeWindow=60&minScore=0.5`

### Files to create/modify
- `packages/backend/src/services/event-similarity.ts` (new)
- `packages/shared/src/schemas/similarity-types.ts` (new — types + zod schemas)
- `packages/shared/src/index.ts` (export new types)
- `packages/backend/src/routes/events.ts` (add similar endpoint)
- `packages/backend/src/__tests__/event-similarity.test.ts` (new)

### Requirements
- Use existing DB connection patterns
- Keyword extraction: simple tokenize + stopword removal (no external NLP lib needed)
- Run `pnpm build && pnpm --filter @event-radar/backend lint` before committing
- If eslint `maximumDefaultProjectFileMatchCount` error, increase it in `packages/backend/eslint.config.js`
- Tests must use mock data, no real DB
- ≥10 tests: same ticker high score, different ticker low score, time decay, content overlap, threshold filtering, empty results, options handling
- Create branch `feat/event-similarity`, commit, push, create PR to main

### Scanner Plugin Interface (`scanner-plugin.ts`)
- Define a `ScannerPlugin` interface that external plugins must implement
- Interface: `{ id, name, version, description, configSchema?, create(config, deps): BaseScanner }`
- `deps` provides: logger, eventBus, httpClient (fetch wrapper with rate limiting)
- Config schema uses zod for validation
- Plugin metadata: author, license, homepage, tags

### Plugin Loader (`plugin-loader.ts`)
- Load plugins from a configurable directory (`SCANNER_PLUGINS_DIR` env var, default `./plugins/`)
- Each plugin is a directory with `package.json` + `index.ts` (or compiled `index.js`)
- Dynamic import: `await import(pluginPath)` → validate exports → register scanner
- Hot-reload support: watch plugin directory for changes (optional, behind flag)
- Error isolation: plugin crashes don't take down the main process (try/catch around poll)

### Plugin Registry (`plugin-registry.ts`)
- Extends existing scanner registry to support dynamic plugins
- Methods: `registerPlugin(plugin)`, `unregisterPlugin(id)`, `listPlugins()`, `getPlugin(id)`
- Plugin lifecycle: `init()` → `start()` → `poll()` → `stop()` → `destroy()`
- Health tracking per plugin (last poll time, error count, status)

### Plugin Config (`plugin-config.ts`)
- Per-plugin configuration stored in `config/plugins.json` or env vars
- Schema validation on load
- Support for secrets (API keys) via env var interpolation: `${ENV_VAR_NAME}`

### Example Plugin (`example-plugin/`)
- Create a minimal example scanner plugin as reference implementation
- Monitors a simple RSS feed
- Shows how to implement the interface, handle config, emit events

### Files to create
- `packages/backend/src/plugins/scanner-plugin.ts` — interface + types
- `packages/backend/src/plugins/plugin-loader.ts` — dynamic loader
- `packages/backend/src/plugins/plugin-registry.ts` — registry
- `packages/backend/src/plugins/plugin-config.ts` — config management
- `packages/backend/src/plugins/index.ts` — barrel export
- `packages/backend/src/__tests__/plugin-loader.test.ts`
- `packages/backend/src/__tests__/plugin-registry.test.ts`
- `packages/backend/src/__tests__/fixtures/mock-plugin/index.ts`
- `packages/backend/src/__tests__/fixtures/mock-plugin/package.json`

### Requirements
- Follow existing patterns in the codebase
- IMPORTANT: Run `pnpm build && pnpm --filter @event-radar/backend lint` before committing
- If eslint fails with `maximumDefaultProjectFileMatchCount` error, increase it in `packages/backend/eslint.config.js` (currently 64)
- Tests must use mock data, no real filesystem operations
- Tests must NOT use PGlite
- All tests must complete in <10s
- Create branch `feat/scanner-plugin-sdk`, commit, push, create PR to main

### Verification
`turbo build && turbo test && turbo lint` must pass.

## Reference Docs

Read these when working on the relevant area:

- `docs/ARCHITECTURE.md` — system design, event bus, backpressure, Python/TS boundary, auth
- `docs/SOURCES.md` — all 30+ data sources by tier
- `docs/FRONTEND.md` — dashboard panels, UX spec, keyboard shortcuts
- `docs/DELIVERY.md` — Bark/Telegram/Discord/webhook alert routing
- `docs/ROADMAP.md` — phased development plan with milestones
- `docs/REFERENCES.md` — open-source projects to integrate
- `docs/REVIEW.md` — architecture review findings

## Git

Conventional Commits: `feat(scanner): add SEC 8-K polling`. Branch: `feat/`, `fix/`, `docs/`. Squash merge PRs. Never push directly to main for non-trivial changes.
