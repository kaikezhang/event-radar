# Current Task: P1B.2 — Tier 2 Social Scanners (Truth Social + X/Twitter)

## Goal
实现两个政治/社交 scanner：Trump Truth Social 和 Elon Musk X (Twitter) 监控。这两个是市场影响最大的个人社交账号。

## Requirements

### 1. Truth Social Scanner (`packages/backend/src/scanners/truth-social-scanner.ts`)
- 继承 `BaseScanner`
- 监控 Trump 的 Truth Social 帖子
- 数据源：Truth Social RSS/API 或第三方聚合（truthsocial.com/@realDonaldTrump）
  - 优先尝试 RSS: `https://truthsocial.com/@realDonaldTrump.rss`
  - 备选：用 public API 或第三方镜像站
- 解析帖子内容，提取：
  - 关键词匹配（tariff, trade, china, ban, executive order 等）
  - Ticker 提取（如果提到公司名）
  - Sentiment 初步判断
- `scan()` 返回 `RawEvent[]`
- Dedup：基于 post ID 去重
- Poll interval: 60s（可配置）

### 2. X/Twitter Scanner (`packages/backend/src/scanners/x-scanner.ts`)
- 继承 `BaseScanner`
- 监控 Elon Musk (@elonmusk) 的推文
- 数据源：X API v2 (需要 Bearer Token) 或 Nitter RSS 镜像
  - 优先：Nitter RSS `https://nitter.net/elonmusk/rss`（免费，不需要 API key）
  - 备选：X API v2 `/2/users/:id/tweets`
- 解析推文内容，提取关键词、ticker、sentiment
- 特殊处理：Elon 的推文可能影响 TSLA, DOGE, BTC
  - 如果推文提到 Tesla/SpaceX 相关 → ticker: TSLA
  - 如果推文提到 crypto/doge → 标记 crypto-related
- Dedup：基于 tweet ID
- Poll interval: 60s

### 3. Keyword Extraction Utility (`packages/backend/src/utils/keyword-extractor.ts`)
- `extractTickers(text: string): string[]` — 从文本提取 ticker symbols
  - 匹配 $AAPL 格式
  - 匹配已知公司名到 ticker 映射（Apple → AAPL, Tesla → TSLA 等）
  - 常见 50 个公司名映射表
- `extractKeywords(text: string, dictionary: string[]): string[]` — 匹配关键词列表
- `estimateSentiment(text: string): 'bullish' | 'bearish' | 'neutral'`
  - 简单关键词 sentiment：ban/tariff/sanctions → bearish, deal/agreement/boost → bullish
  - 不用 ML，纯关键词匹配（LLM classifier 会补充）

### 4. Scanner Registration
- 在 scanner registry 注册两个新 scanner
- Env vars: `TRUTH_SOCIAL_ENABLED`, `X_SCANNER_ENABLED`（默认 disabled）
- X API key: `X_BEARER_TOKEN`（可选，没有时用 Nitter RSS）

### 5. Types (`packages/shared/src/schemas/social-types.ts`)
```typescript
export const SocialPostSchema = z.object({
  platform: z.enum(['truth_social', 'x_twitter']),
  postId: z.string(),
  author: z.string(),
  content: z.string(),
  publishedAt: z.string(),
  url: z.string(),
  replyCount: z.number().optional(),
  likeCount: z.number().optional(),
  repostCount: z.number().optional(),
});
```

### 6. Tests (≥10 tests)
- Truth Social: parse RSS item → RawEvent
- Truth Social: extract ticker from "tariff on China" → no ticker
- Truth Social: extract ticker from "Truth about Tesla" → TSLA
- Truth Social: dedup by post ID
- X Scanner: parse tweet → RawEvent
- X Scanner: Elon + Tesla mention → TSLA ticker
- X Scanner: crypto mention → tagged
- Keyword extractor: $AAPL → ['AAPL']
- Keyword extractor: "Apple announced" → ['AAPL']
- Sentiment: "ban imports" → bearish
- Sentiment: "great deal" → bullish

### Files to create/modify
- `packages/shared/src/schemas/social-types.ts`
- `packages/shared/src/index.ts` — export
- `packages/backend/src/scanners/truth-social-scanner.ts`
- `packages/backend/src/scanners/x-scanner.ts`
- `packages/backend/src/utils/keyword-extractor.ts`
- `packages/backend/src/scanners/registry.ts` — register
- `packages/backend/src/__tests__/truth-social-scanner.test.ts`
- `packages/backend/src/__tests__/x-scanner.test.ts`
- `packages/backend/src/__tests__/keyword-extractor.test.ts`

## Verification
- `pnpm build && pnpm --filter @event-radar/backend lint` passes
- All tests pass
- Branch `feat/social-scanners`, create PR to main
- **DO NOT merge. DO NOT run gh pr merge.**
