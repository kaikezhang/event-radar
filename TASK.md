# TASK.md — Political Severity: LLM-based instead of keyword-based

## ⚠️ DO NOT MERGE ANY PRs. Create PR and STOP.

## Overview
The current political severity boost uses keyword matching (e.g., "iran" → AUTO HIGH).
This is too blunt — Trump mentions Iran in a sarcastic rant and it gets HIGH.
Fix: let the LLM classify political posts with market-aware context.

## 1. Change political rules from severity-setting to tagging-only
- File: `packages/backend/src/pipeline/political-rules.ts`
- Current: `{ type: 'setSeverity', value: 'HIGH' }` for keyword matches
- Change to: 
  - Remove `setSeverity` actions from ALL political keyword rules
  - Keep only `addTags` actions (e.g., `['trump', 'political-market-impact', 'iran']`)
  - Add a new action type or tag: `force-llm-classification` to ensure LLM always classifies these
  - The rule engine should TAG the event, NOT classify it

## 2. Force LLM classification for political posts
- File: `packages/backend/src/event-pipeline.ts` or wherever LLM classification is triggered
- When an event has tag `political-market-impact`:
  - ALWAYS run LLM classification, even if rule engine confidence is high
  - Do NOT skip LLM for these events (overrides the DQ-3 optimization)

## 3. Add political context to LLM classification prompt
- File: `packages/backend/src/pipeline/classification-prompt.ts`
- When source is `truth-social` or `x`, add special instructions to the prompt:
  ```
  POLITICAL POST CLASSIFICATION:
  This is a post from a political figure. Classify based on ACTUAL MARKET IMPACT:
  
  CRITICAL: Announces specific policy action (military strikes, trade deal, sanctions, executive order, tariff changes) that directly affects markets or specific sectors. Must be a concrete ACTION, not an opinion.
  Example: "I have instructed the Department of War to postpone military strikes" = CRITICAL
  
  HIGH: Announces intent or threat of policy action that could affect markets. Concrete but not yet enacted.
  Example: "We are looking very seriously at tariffs on China" = HIGH
  
  MEDIUM: Comments on economic/market topics without announcing specific action.
  Example: "The Fed should lower rates" = MEDIUM
  
  LOW: Political commentary, insults, campaign rhetoric, slogans with no specific market impact.
  Example: "PEACE THROUGH STRENGTH!!!" = LOW
  Example: "The Democrats are destroying this country" = LOW
  ```

## 4. Keep tariff as CRITICAL in rules (exception)
- Tariff mentions from Trump are almost always market-moving
- Keep the `trump-tariff` and `trump-trade` rules with CRITICAL severity
- But ALSO force LLM classification to validate

## Testing
- `pnpm --filter @event-radar/backend test` — all tests must pass
- Add tests: 
  - "POSTPONE MILITARY STRIKES" → CRITICAL (via LLM)
  - "PEACE THROUGH STRENGTH" → LOW (via LLM)
  - "tariffs on China" → CRITICAL (via rule + LLM validation)

## PR
- Branch: `feat/political-llm-classification`
- Title: `feat: political severity via LLM classification, not keyword matching`
- **DO NOT MERGE. Create PR and stop.**
