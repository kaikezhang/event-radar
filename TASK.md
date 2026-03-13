# TASK.md — Evolution Phase 3: 扩展数据源

## Overview

Phase 2 已完成（Rich Delivery + Market Regime + Golden Test Set + Health Check）。Phase 3 目标是补齐 review 中反复提到的关键缺失数据源，尤其是二进制事件（halt）和高优先级信号。

参考文档：
- `docs/EVOLUTION-STRATEGY.md` — Phase 3 规划
- `docs/SOURCES.md` — 完整数据源愿景

---

## Task A: NYSE/Nasdaq Trading Halt Feed (Codex)

实现交易所停牌/恢复 scanner。这是二进制事件（停牌/恢复），不需要 AI 分类。

### Backend — Halt Scanner

1. **新文件**: `packages/backend/src/scanners/halt-scanner.ts`
   - 继承 `BaseScanner`
   - 数据源: Nasdaq Trading Halts RSS/JSON feed
     - URL: `https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts` (RSS)
     - 备用: `https://www.nasdaqtrader.com/dynamic/symdir/shorthalts/shorthalts.json`
     - 或 scrape `https://www.nasdaqtrader.com/trader.aspx?id=TradeHalts` 页面
   - 轮询间隔: 15 秒（halt 时效性极强）
   - 解析字段: ticker, halt time, resume time, halt reason code, market (NYSE/NASDAQ/etc)

2. **Halt Reason Codes** (自动映射 severity):
   - `T1` (News Pending) → CRITICAL
   - `T2` (News Dissemination) → HIGH  
   - `T5` (Single Stock Circuit Breaker - LULD) → CRITICAL
   - `T6` (Extraordinary Market Volatility) → CRITICAL
   - `T8` (ETF Halt) → HIGH
   - `T12` (IPO Not Yet Trading) → MEDIUM
   - `M` (Volatility Trading Pause - MWCB) → CRITICAL
   - `H4` (Non-compliance) → MEDIUM
   - Other → LOW

3. **事件格式**:
   ```ts
   {
     source: 'trading-halt',
     type: 'halt' | 'resume',
     title: `${ticker} trading HALTED — ${reasonDescription}` | `${ticker} trading RESUMED`,
     severity: /* mapped from reason code */,
     direction: 'bearish', // halts are generally bearish, resumes neutral
     tickers: [ticker],
     metadata: { haltReasonCode, market, haltTime, resumeTime, isLULD: boolean }
   }
   ```

4. **不需要 LLM 分类** — halt 是结构化二进制事件，直接映射 severity

5. **去重**: 用 `ticker + haltTime + reasonCode` 作为 dedup key

6. **注册**: 在 `app.ts` 注册 scanner，用 env var `HALT_SCANNER_ENABLED` 控制

7. **Tests**: ≥10 个测试 — RSS 解析、reason code mapping、dedup、halt/resume 对、LULD detection

---

## Task B: Company IR Website Monitor (Codex)

监控上市公司 Investor Relations 页面的新闻发布，这通常比 PR Newswire 更快。

### Backend — IR Monitor Scanner

1. **新文件**: `packages/backend/src/scanners/ir-monitor-scanner.ts`
   - 继承 `BaseScanner`
   - 监控策略: 轮询公司 IR 页面的 RSS/press release feeds
   - 初始支持的公司（高影响力）:
     - AAPL: `https://investor.apple.com/sec-filings/default.aspx`
     - NVDA: `https://investor.nvidia.com/news/press-release-details/`
     - TSLA: `https://ir.tesla.com/press-release`
     - META: `https://investor.fb.com/press-releases/`
     - MSFT: `https://www.microsoft.com/en-us/investor/earnings/fy-2026-q2/press-release`
     - GOOGL: `https://abc.xyz/investor/`
   - 实际实现: 很多 IR 页面提供 RSS feed，优先用 RSS；没有 RSS 的用 page diff detection

2. **Page Diff Detection** (for pages without RSS):
   - 存储上次 fetch 的 page content hash
   - 每 5 分钟 fetch 一次，对比 hash
   - 有变化 → 提取新内容 → 生成事件
   - 用 `cheerio` 解析 HTML，提取 press release 标题 + 链接

3. **配置**:
   - `IR_MONITOR_COMPANIES` env var: 逗号分隔的 JSON 配置
   - 默认监控 Mag 7 + 高频新闻公司
   - 每个公司配置: `{ ticker, name, feedUrl?, pageUrl, selector? }`

4. **事件格式**:
   ```ts
   {
     source: 'company-ir',
     type: 'press-release',
     title: `[${ticker}] ${pressReleaseTitle}`,
     body: pressReleaseSnippet,
     tickers: [ticker],
     metadata: { companyName, url, detectedAt }
   }
   ```

5. **Tests**: ≥8 个测试 — RSS 解析、page diff detection、配置解析、dedup

---

## Task C: Dilution Event Scanner (Codex)

监控稀释事件（ATM offerings、可转债、增发），这些对股价有直接负面影响。

### Backend — Dilution Scanner

1. **新文件**: `packages/backend/src/scanners/dilution-scanner.ts`
   - 继承 `BaseScanner`
   - 数据源: SEC EDGAR ATOM feed + 关键词过滤
     - 监控 Form S-3 (shelf registration), Form 424B (prospectus supplement), 8-K Item 8.01
     - URL: `https://efts.sec.gov/LATEST/search-index?q=%22at-the-market%22+OR+%22ATM+offering%22+OR+%22convertible+notes%22&dateRange=custom&startdt=YYYY-MM-DD&enddt=YYYY-MM-DD&forms=S-3,424B2,424B5,8-K`
   - 轮询间隔: 60 秒

2. **Detection Patterns**:
   - **ATM Offering**: S-3/424B filings containing "at-the-market", "ATM"
   - **Convertible Notes**: 8-K/424B containing "convertible", "conversion price"
   - **Secondary Offering**: S-1/424B containing "secondary offering", "selling stockholders"
   - **Shelf Registration**: S-3 "shelf registration statement"
   - **PIPE**: 8-K containing "private investment in public equity", "PIPE"

3. **Severity Mapping**:
   - ATM Offering announced → HIGH (immediate dilution)
   - Convertible Notes → MEDIUM (future dilution)
   - Secondary Offering → HIGH (immediate selling pressure)
   - Shelf Registration filed → LOW (potential future dilution)
   - PIPE → MEDIUM

4. **事件格式**:
   ```ts
   {
     source: 'dilution-monitor',
     type: 'dilution',
     title: `${ticker} — ${dilutionType} detected`,
     body: filingSnippet,
     severity: /* mapped */,
     direction: 'bearish',
     tickers: [ticker],
     metadata: { dilutionType, formType, filingUrl, estimatedAmount? }
   }
   ```

5. **Tests**: ≥8 个测试 — 各种 dilution pattern 检测、severity mapping、false positive filtering

---

## General Rules

- TypeScript strict mode, ESM with `.js` extensions in imports
- Follow existing scanner patterns (BaseScanner, EventBus, SeenIdBuffer)
- Run `pnpm test` — all tests must pass
- Run `pnpm lint` — no lint errors
- Create feature branch + PR. Do NOT push to main.
- Do NOT merge PRs.
- ALL coding by Codex. CC only reviews.
