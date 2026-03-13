# TASK.md — Phase 1: Core Scanners

## Overview

Two new scanners needed to fill the biggest source gaps. Follow existing scanner patterns (see `federal-register-scanner.ts`, `breaking-news-scanner.ts`).

## Task A: SEC EDGAR 8-K / Form 4 Scanner (Codex)

Build `packages/backend/src/scanners/sec-edgar-scanner.ts` — a live scanner that polls SEC EDGAR for new 8-K and Form 4 filings.

### Data Sources

1. **EDGAR Full-Text Search API**: `https://efts.sec.gov/LATEST/search-index?q="8-K"&dateRange=custom&startdt=TODAY&enddt=TODAY` — for 8-K filings
2. **EDGAR RSS feeds**: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&dateb=&owner=include&count=40&search_text=&start=0&output=atom` — Atom feed for recent filings
3. **Form 4 RSS**: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&dateb=&owner=include&count=40&search_text=&start=0&output=atom` — insider trades

### Requirements

1. **Scanner class**: Extend `BaseScanner` from `@event-radar/shared`
2. **Polling**: Every 60s for 8-K, every 120s for Form 4 (within SEC's 10 req/s fair-access policy)
3. **User-Agent**: Must set `User-Agent: EventRadar/1.0 (contact@example.com)` per SEC policy
4. **SeenIdBuffer**: Use `SeenIdBuffer` from `./scraping/scrape-utils.js` for dedup (keyed on accession number)
5. **Ticker extraction**: Use `extractTickers()` from `./ticker-extractor.js`
6. **Event mapping**:
   - `source`: `'sec-edgar'`
   - `severity`: Map by 8-K item number (1.01, 2.05, 5.02 → HIGH; others → MEDIUM)
   - `title`: `"SEC 8-K: {Company Name} — Item {number} ({description})"`
   - `body`: Include filing summary, accession number, CIK, link to filing
   - `sourceEventId`: Accession number (e.g., `0001193125-26-012345`)
   - For Form 4: `severity` based on transaction value (>$1M → HIGH, >$10M → CRITICAL)
   - For Form 4: `title`: `"SEC Form 4: {Officer} {bought/sold} ${amount} of {Ticker}"`
7. **RSS-only v1**: Parse the Atom feed XML for filing metadata. Do NOT parse the HTML content of the filing itself.
8. **Enable via env**: `SEC_EDGAR_ENABLED=true` (default false)
9. **Tests**: At least 5 tests covering: RSS parsing, item severity mapping, Form 4 value thresholds, dedup, ticker extraction
10. **Error handling**: Use auto-backoff from BaseScanner

### Key 8-K Items (severity mapping)

| Item | Description | Severity |
|------|-------------|----------|
| 1.01 | Material Agreement (M&A) | HIGH |
| 1.02 | Termination of Agreement | HIGH |
| 2.01 | Completion of Acquisition | HIGH |
| 2.05 | Restructuring / Layoffs | HIGH |
| 2.06 | Material Impairments | HIGH |
| 5.02 | Officer Change | HIGH |
| 7.01 | Reg FD Disclosure | MEDIUM |
| 8.01 | Other Events | MEDIUM |
| Others | Various | LOW |

### Registration

Register in `packages/backend/src/app.ts` alongside other scanners, gated by `SEC_EDGAR_ENABLED` env var.

---

## Task B: PR Newswire + BusinessWire RSS Scanner (CC)

Build `packages/backend/src/scanners/newswire-scanner.ts` — a scanner that monitors PR Newswire and BusinessWire RSS feeds for corporate press releases.

### Data Sources

1. **PR Newswire**: `https://www.prnewswire.com/rss/financial-services-news.xml` (and other category feeds)
2. **BusinessWire**: `https://feed.businesswire.com/rss/home/?rss=G1QFDERJhkQ%3D` (all news) or category-specific feeds
3. **GlobeNewswire**: `https://www.globenewswire.com/RssFeed/orgclass/1/feedTitle/GlobeNewswire%20-%20News%20Releases` (bonus)

### Requirements

1. **Scanner class**: Extend `BaseScanner` from `@event-radar/shared`
2. **Polling**: Every 120s (2 min) — newswires update frequently but not as urgently as SEC
3. **RSS parsing**: Parse standard RSS/Atom XML feeds. Use built-in Node fetch + a lightweight XML parser (or regex for simple RSS)
4. **SeenIdBuffer**: Dedup by article URL or guid
5. **Ticker extraction**: Use `extractTickers()` — newswires often mention tickers in title/body
6. **Event mapping**:
   - `source`: `'pr-newswire'` | `'businesswire'` | `'globenewswire'`
   - `severity`: Default MEDIUM; upgrade to HIGH if title contains key patterns (M&A, FDA approval, restructuring, bankruptcy, earnings pre-announcement)
   - `title`: Original press release headline
   - `body`: RSS description/summary text (first 500 chars)
   - `sourceEventId`: Article guid or URL hash
   - `publishedAt`: RSS pubDate parsed to Date
7. **Keyword severity upgrade patterns** (case-insensitive):
   - HIGH: `merger`, `acquisition`, `FDA approv`, `restructur`, `bankrupt`, `Chapter 11`, `layoff`, `workforce reduction`, `earnings pre-announcement`, `guidance`
   - CRITICAL: `hostile takeover`, `delisted`, `SEC investigation`, `fraud`
8. **Enable via env**: `NEWSWIRE_ENABLED=true` (default false)
9. **Tests**: At least 5 tests covering: RSS XML parsing, severity keyword mapping, dedup, ticker extraction, multiple feed handling
10. **Error handling**: Use auto-backoff from BaseScanner; individual feed failures should not crash the scanner

### Registration

Register in `packages/backend/src/app.ts` alongside other scanners, gated by `NEWSWIRE_ENABLED` env var.

---

## General Rules

- TypeScript strict mode, ESM with `.js` extensions in imports
- Follow existing scanner patterns for consistency
- Run `pnpm test` — all tests must pass
- Run `pnpm lint` — no lint errors
- Create feature branch + PR. Do NOT push to main.
- Do NOT merge PRs.
