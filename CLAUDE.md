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

## Current Task: P4.4.1+P4.4.2 — 自定义规则 DSL & 解析器

### Goal
实现告警自定义规则系统：用户定义规则 DSL 来过滤/优先级排序事件，规则引擎解析并执行这些规则。

### Requirements

1. **Rule DSL Grammar**
   - 语法: `IF <conditions> THEN <actions>`
   - 条件支持:
     - `source = "sec-edgar"` / `source IN ("sec-edgar", "reddit")`
     - `ticker = "AAPL"` / `ticker IN ("AAPL", "TSLA")`
     - `keyword CONTAINS "merger"` / `keyword MATCHES "acqui.*"`
     - `event_type = "filing"` / `event_type IN ("filing", "earnings")`
     - `severity >= "HIGH"` (比较: `=`, `!=`, `>`, `>=`, `<`, `<=`)
     - `confidence >= 0.8`
   - 逻辑运算: `AND`, `OR`, `NOT`, 括号分组
   - Actions:
     - `priority = "CRITICAL"` / `priority = "HIGH"` / `priority = "MEDIUM"` / `priority = "LOW"`
     - `tag = "watchlist"` / `tag = "ignore"`
     - `notify = true` / `notify = false`
   - 示例:
     ```
     IF source = "sec-edgar" AND severity >= "HIGH" AND ticker IN ("AAPL", "TSLA") THEN priority = "CRITICAL"
     IF keyword CONTAINS "bankruptcy" THEN priority = "CRITICAL", notify = true
     IF confidence < 0.3 THEN tag = "low-quality", notify = false
     ```

2. **Rule Parser** (`packages/backend/src/services/rule-parser.ts`)
   - `parseRule(dsl: string): Result<ParsedRule, ParseError>` — 解析 DSL 字符串
   - `validateRule(rule: ParsedRule): Result<void, ValidationError[]>` — 验证规则合法性
   - 使用递归下降解析器（不依赖外部库）
   - 清晰的错误消息（行号、列号、期望 vs 实际）

3. **Rule Engine** (`packages/backend/src/services/rule-engine-v2.ts`)
   - `evaluateRules(event, rules): RuleResult` — 对事件执行所有规则
   - 规则按优先级排序执行（用户可设定 rule order）
   - 第一个匹配的规则决定 priority（first-match-wins）
   - 未匹配任何规则 → 使用默认 priority
   - `addRule(rule): Promise<Rule>` — 添加规则
   - `updateRule(id, rule): Promise<Rule>` — 更新规则
   - `deleteRule(id): Promise<void>` — 删除规则
   - `listRules(): Promise<Rule[]>` — 列出所有规则
   - `reorderRules(ids): Promise<void>` — 重排规则顺序

4. **Types** (`packages/shared/src/schemas/rule-types.ts`)
   ```typescript
   export const ConditionOperatorSchema = z.enum(['=', '!=', '>', '>=', '<', '<=', 'IN', 'CONTAINS', 'MATCHES']);
   export const LogicalOperatorSchema = z.enum(['AND', 'OR']);
   export const RuleFieldSchema = z.enum(['source', 'ticker', 'keyword', 'event_type', 'severity', 'confidence']);
   export const PrioritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

   export const ParsedConditionSchema = z.object({
     field: RuleFieldSchema,
     operator: ConditionOperatorSchema,
     value: z.union([z.string(), z.number(), z.array(z.string())]),
     negate: z.boolean().default(false),
   });

   export const ParsedRuleSchema = z.object({
     id: z.string().uuid(),
     name: z.string(),
     dsl: z.string(),
     conditions: z.any(), // parsed AST
     actions: z.record(z.string(), z.union([z.string(), z.boolean()])),
     order: z.number(),
     enabled: z.boolean().default(true),
     createdAt: z.string(),
     updatedAt: z.string(),
   });

   export const RuleResultSchema = z.object({
     matched: z.boolean(),
     ruleId: z.string().nullable(),
     ruleName: z.string().nullable(),
     actions: z.record(z.string(), z.union([z.string(), z.boolean()])),
   });
   ```

5. **Database Schema**
   - `alert_rules` 表: id (uuid), name, dsl (text), conditions_ast (jsonb), actions (jsonb), rule_order (int), enabled (bool), created_at, updated_at
   - 用 drizzle-orm schema 定义

6. **API Endpoints**
   - `POST /api/v1/rules` — 创建规则 `{ name, dsl }`（自动 parse + validate）
   - `GET /api/v1/rules` — 列出所有规则
   - `PUT /api/v1/rules/:id` — 更新规则
   - `DELETE /api/v1/rules/:id` — 删除规则
   - `POST /api/v1/rules/reorder` — 重排 `{ ids: string[] }`
   - `POST /api/v1/rules/test` — 测试规则 `{ dsl, event }` → 返回匹配结果
   - `POST /api/v1/rules/validate` — 验证 DSL 语法 `{ dsl }` → 返回错误或 OK
   - 所有 endpoints 需要 API key auth

7. **Tests** (≥15 tests)
   - 解析简单条件 `source = "sec-edgar"`
   - 解析复合条件 AND/OR
   - 解析 IN 列表
   - 解析 CONTAINS/MATCHES
   - 解析 severity 比较（有序: LOW < MEDIUM < HIGH < CRITICAL）
   - 解析语法错误 → 清晰错误消息
   - 规则执行 first-match-wins
   - 多规则优先级排序
   - 未匹配 → 默认结果
   - CRUD 操作
   - 规则重排序
   - 测试 endpoint
   - 验证 endpoint
   - API auth
   - 空规则列表

### Files to create/modify
- `packages/shared/src/schemas/rule-types.ts`
- `packages/shared/src/index.ts` — export
- `packages/backend/src/db/schema.ts` — alert_rules 表
- `packages/backend/src/services/rule-parser.ts` — 递归下降解析器
- `packages/backend/src/services/rule-engine-v2.ts` — 规则引擎
- `packages/backend/src/routes/rules.ts` — API
- `packages/backend/src/app.ts` — 注册 routes
- `packages/backend/src/__tests__/rule-parser.test.ts`
- `packages/backend/src/__tests__/rule-engine-v2.test.ts`

### Verification
- `pnpm build && pnpm --filter @event-radar/backend lint` must pass
- All tests pass
- Create branch `feat/rule-dsl`, commit, push, create PR to main
- **严禁 merge PR！严禁运行 gh pr merge！**
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
