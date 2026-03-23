# TASK.md — Upgrade Truth Social Scanner to RSS Feed

## ⚠️ DO NOT MERGE ANY PRs. Create PR and STOP.

## Overview
Upgrade the Truth Social scanner from HTML scraping to RSS feed parsing.
RSS feed URL: `https://trumpstruth.org/feed` — standard RSS 2.0 format.

## RSS Feed Structure
```xml
<item>
  <title><![CDATA[POST TEXT]]></title>
  <link>https://trumpstruth.org/statuses/37409</link>
  <description><![CDATA[<p>POST TEXT WITH HTML</p>]]></description>
  <guid>https://trumpstruth.org/statuses/37409</guid>
  <pubDate>Mon, 23 Mar 2026 11:23:40 +0000</pubDate>
  <truth:originalUrl>https://truthsocial.com/@realDonaldTrump/116278232362967212</truth:originalUrl>
  <truth:originalId>116278232362967212</truth:originalId>
</item>
```

## Implementation

### 1. Rewrite poll() method to use RSS
- File: `packages/backend/src/scanners/truth-social-scanner.ts`
- Fetch `https://trumpstruth.org/feed` with scannerFetch
- Parse the XML response — use a simple regex or built-in DOMParser approach:
  - Extract `<item>` blocks
  - For each item: get `<title>`, `<link>`, `<pubDate>`, `<guid>`, `<truth:originalUrl>`, `<truth:originalId>`
- The `<title>` contains clean text (no HTML tags) — use this for the post text
- Parse `<pubDate>` (RFC 2822 format: "Mon, 23 Mar 2026 11:23:40 +0000") to Date
- Use `<guid>` or the status number from `<link>` as the post ID for dedup
- Use `<truth:originalUrl>` as the event URL (links to actual Truth Social post)

### 2. Keep it simple — no XML parser library needed
- The RSS structure is very regular and can be parsed with regex:
  ```typescript
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  for (const item of items) {
    const title = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] ?? '';
    const link = item.match(/<link>(.*?)<\/link>/)?.[1] ?? '';
    const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? '';
    const originalUrl = item.match(/<truth:originalUrl>(.*?)<\/truth:originalUrl>/)?.[1] ?? '';
    const originalId = item.match(/<truth:originalId>(.*?)<\/truth:originalId>/)?.[1] ?? '';
  }
  ```

### 3. Remove the old HTML parsing code
- Remove `parseHomepageHtml()` and related HTML regex patterns
- The `parseTruthSocialPosts()` function (DOM-based) can stay for backward compatibility but shouldn't be used

### 4. Add political impact severity boost
- When a Truth Social post mentions keywords that indicate market-moving content:
  - Keywords: iran, china, tariff, military, sanctions, strike, war, peace, trade deal, executive order, fed, interest rate, ban, postpone, halt
  - Boost severity to HIGH (at minimum) for these posts
  - This ensures Trump's Iran ceasefire announcement gets classified as HIGH/CRITICAL, not MEDIUM

### 5. Update tests
- Update truth-social scanner tests to test RSS parsing
- Add test with sample RSS XML
- Test the political impact severity boost

## Testing
- `pnpm --filter @event-radar/backend test` — all tests must pass

## PR
- Branch: `feat/truth-social-rss`
- Title: `feat: upgrade Truth Social scanner to RSS feed + political severity boost`
- **DO NOT MERGE. Create PR and stop.**
