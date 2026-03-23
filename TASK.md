# TASK.md — Rewrite Truth Social Scanner to use trumpstruth.org

## ⚠️ DO NOT MERGE ANY PRs. Create PR and STOP.

## Overview
The current Truth Social scanner uses Playwright to scrape truthsocial.com directly, which is unreliable (currently DOWN with 5 consecutive errors). Rewrite to use trumpstruth.org — a reliable, searchable archive of Trump's Truth Social posts that can be scraped with simple HTTP GET (no browser needed).

## Source Analysis
- **URL**: `https://trumpstruth.org` (homepage lists latest posts)
- **Individual posts**: `https://trumpstruth.org/statuses/{id}` (incrementing IDs)
- **No JS rendering needed** — pure HTML, curl works
- **HTML structure**:
  - Post ID: extracted from `href` attribute like `href="https://trumpstruth.org/statuses/37408"`
  - Timestamp: `<a href="..." class="status-info__meta-item">March 23, 2026, 7:05 AM</a>` (ET timezone)
  - Content: `<div class="status__content"><p>POST TEXT HERE</p></div>`
  - Author: always `@realDonaldTrump`
- **Delay**: ~5-15 minutes behind Truth Social (acceptable for our use case)
- **Reliability**: Static HTML, no Cloudflare protection, no anti-bot

## Implementation

### 1. Rewrite Truth Social Scanner
- File: `packages/backend/src/scanners/truth-social-scanner.ts`
- **Remove ALL Playwright/browser dependencies** — use simple HTTP fetch (`scannerFetch`)
- Poll `https://trumpstruth.org` every 3 minutes (existing interval)
- Parse HTML to extract posts:
  ```typescript
  // Extract posts from HTML
  // Pattern: <a href="https://trumpstruth.org/statuses/XXXXX" class="status-info__meta-item">DATE</a>
  // Content: <div class="status__content"><p>TEXT</p></div>
  ```
- For each post:
  - ID = status number from URL (e.g., "37408")
  - Text = inner text of `<div class="status__content">`
  - Timestamp = parse "March 23, 2026, 7:05 AM" (ET timezone → UTC)
  - URL = `https://trumpstruth.org/statuses/{id}`
- Use SeenIdBuffer to dedup (already exists)
- Keep existing keyword extraction, ticker extraction, sentiment analysis

### 2. HTML Parsing
- Use a simple regex-based approach or a lightweight HTML parser
- DO NOT add cheerio or jsdom as dependencies — keep it lightweight
- The HTML structure is simple enough for regex:
  ```typescript
  // Extract all post blocks
  const postPattern = /href="https:\/\/trumpstruth\.org\/statuses\/(\d+)"[^>]*class="status-info__meta-item">([^<]+)<\/a>/g;
  const contentPattern = /<div class="status__content"><p>([\s\S]*?)<\/p><\/div>/g;
  ```
- Strip HTML tags from content text
- Parse date: "March 23, 2026, 7:05 AM" → Date object (assume ET timezone)

### 3. Remove browserPool dependency
- The scanner should NOT import or use `browserPool`
- Use the existing `scannerFetch` utility for HTTP requests
- This makes the scanner much more reliable and lightweight

### 4. Keep existing features
- Keep the `POLITICAL_KEYWORDS` matching
- Keep the `estimateSentiment`, `extractKeywords`, `extractTickers` calls
- Keep the severity classification logic (political keywords → MEDIUM or higher)
- Keep the `isRepost` detection if possible (check if the HTML has repost indicators)

### 5. Error handling
- If fetch fails, return err() with descriptive message
- If HTML parsing finds 0 posts, log a warning but don't error (page might be temporarily empty)
- Add null guards everywhere — no more "posts is not iterable" crashes

## Testing
- Update existing truth-social scanner tests
- Add test for HTML parsing with sample HTML
- `pnpm --filter @event-radar/backend test` — all tests must pass

## PR
- Branch: `feat/truth-social-rewrite`
- Title: `feat: rewrite Truth Social scanner to use trumpstruth.org (no Playwright)`
- **DO NOT MERGE. Create PR and stop.**
