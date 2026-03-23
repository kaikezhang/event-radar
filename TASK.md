# TASK.md — DQ-3: Fix Classification Pipeline

## ⚠️ DO NOT MERGE ANY PRs. Create PR and STOP.

## Overview
The LLM classifier is a rubber stamp — always says MEDIUM + high confidence + agrees with rule engine.
Fix the prompt to produce calibrated, useful classifications.

## 1. Improve classification prompt with severity calibration
- File: `packages/backend/src/pipeline/classification-prompt.ts`
- Add few-shot examples to the SYSTEM_PROMPT showing what each severity level means:

```
SEVERITY CALIBRATION:
- CRITICAL: Trading halts, FDA drug approvals/rejections, major M&A (>$1B), presidential executive orders affecting specific sectors, earnings surprises >20%. These events move prices 5%+ immediately.
- HIGH: SEC insider trading (Form 4 large transactions >$1M), analyst upgrades/downgrades from major firms, earnings surprises 5-20%, significant regulatory actions. These events move prices 2-5%.
- MEDIUM: Routine SEC filings (10-Q, 10-K), earnings in-line with estimates, industry reports, moderate news. Prices may move 0.5-2%.
- LOW: Social media trending without news catalyst, routine corporate updates, conference presentations, minor regulatory filings. Minimal price impact expected.

CONFIDENCE CALIBRATION:
- Use the FULL range 0.3 to 0.95
- 0.9+ = unambiguous event with clear market impact (e.g., trading halt, FDA decision)
- 0.7-0.9 = likely classification but some ambiguity
- 0.5-0.7 = uncertain, could go either way
- 0.3-0.5 = best guess, limited information
- NEVER output 1.0 or 0.0
```

## 2. Remove direction prediction from classifier
- File: `packages/backend/src/pipeline/classification-prompt.ts`
- The direction prediction (BULLISH/BEARISH) has 1.85% accuracy — worse than random
- Change: keep the direction field in the schema but set it to "NEUTRAL" by default
- In the prompt, remove the direction classification instruction entirely
- Replace with: "Set direction to NEUTRAL. Direction prediction is not used in the current version."
- This way the schema doesn't break but we stop making wrong predictions

## 3. Stop sending rule engine result to LLM
- File: `packages/backend/src/pipeline/classification-prompt.ts`
- The LLM gets the rule engine result "for context" and then just agrees with it
- Remove the `if (ruleResult)` block that adds rule engine results to the prompt
- Let the LLM classify independently — this is the whole point of having an LLM
- Keep the `ruleResult` parameter in the function signature for backward compatibility but don't use it in the prompt

## 4. Downgrade SEC 8-K Item 8.01 to LOW in default rules
- File: `packages/backend/src/pipeline/default-rules.ts`
- 8-K Item 8.01 ("Other Events") is a catch-all category — press releases, investor presentations, non-material items
- Find the rule that sets 8-K 8.01 to MEDIUM and change it to LOW
- Keep 8-K Item 1.01 (Material Agreements), 2.01 (Asset Acquisition), 5.02 (Officer Changes) as MEDIUM or higher

## 5. Add ticker extraction for common company names
- File: `packages/backend/src/pipeline/` or a new file `packages/backend/src/pipeline/company-ticker-map.ts`
- Create a mapping of top 100 company names to tickers:
  ```typescript
  export const COMPANY_TICKER_MAP: Record<string, string> = {
    'apple': 'AAPL', 'nvidia': 'NVDA', 'tesla': 'TSLA',
    'microsoft': 'MSFT', 'amazon': 'AMZN', 'google': 'GOOGL',
    'alphabet': 'GOOGL', 'meta': 'META', 'facebook': 'META',
    'netflix': 'NFLX', 'boeing': 'BA', 'disney': 'DIS',
    'jpmorgan': 'JPM', 'goldman sachs': 'GS', 'walmart': 'WMT',
    'costco': 'COST', 'target': 'TGT', 'home depot': 'HD',
    'coca-cola': 'KO', 'pepsi': 'PEP', 'pepsico': 'PEP',
    'intel': 'INTC', 'amd': 'AMD', 'qualcomm': 'QCOM',
    'broadcom': 'AVGO', 'cisco': 'CSCO', 'oracle': 'ORCL',
    'salesforce': 'CRM', 'adobe': 'ADBE', 'paypal': 'PYPL',
    'mastercard': 'MA', 'visa': 'V', 'berkshire': 'BRK.B',
    'johnson & johnson': 'JNJ', 'pfizer': 'PFE', 'moderna': 'MRNA',
    'unitedhealth': 'UNH', 'exxon': 'XOM', 'chevron': 'CVX',
    'shell': 'SHEL', 'bp': 'BP', 'palantir': 'PLTR',
    'snowflake': 'SNOW', 'uber': 'UBER', 'airbnb': 'ABNB',
    'coinbase': 'COIN', 'robinhood': 'HOOD', 'gamestop': 'GME',
    'amc': 'AMC', 'nio': 'NIO', 'rivian': 'RIVN',
    'lucid': 'LCID', 'ford': 'F', 'general motors': 'GM',
    'lockheed': 'LMT', 'raytheon': 'RTX', 'northrop': 'NOC',
    'caterpillar': 'CAT', 'deere': 'DE', '3m': 'MMM',
    'micron': 'MU', 'applied materials': 'AMAT', 'lam research': 'LRCX',
    'crowdstrike': 'CRWD', 'palo alto': 'PANW', 'datadog': 'DDOG',
    'servicenow': 'NOW', 'workday': 'WDAY', 'spotify': 'SPOT',
    'roku': 'ROKU', 'pinterest': 'PINS', 'snap': 'SNAP',
    'twitter': 'TWTR', 'baidu': 'BIDU', 'alibaba': 'BABA',
    'tencent': 'TCEHY', 'samsung': 'SSNLF',
    'openai': 'MSFT', 'chatgpt': 'MSFT',
    'anthropic': 'AMZN', 'claude': 'AMZN',
  };
  ```
- Use this in the ticker extraction step (before or during pipeline processing)
- Match case-insensitively against event title + body
- If multiple companies match, pick the first one mentioned

## Testing
- `pnpm --filter @event-radar/backend test` — all tests must pass
- `pnpm --filter @event-radar/web build` — must succeed

## PR
- Branch: `feat/dq3-classification-pipeline`
- Title: `feat: DQ-3 classification pipeline — prompt calibration, direction removal, ticker extraction`
- **DO NOT MERGE. Create PR and stop.**
