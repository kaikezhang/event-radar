import type { RawEvent, ClassificationResult } from '@event-radar/shared';
import {
  LLMEventTypeSchema,
  LlmClassificationResultSchema,
  type LlmClassificationResult,
} from '@event-radar/shared';
import { ok, err, type Result } from '@event-radar/shared';

const EVENT_TYPE_LIST = LLMEventTypeSchema.options.join(', ');

const SYSTEM_PROMPT = `You are a financial event classifier for a real-time trading intelligence platform.

Given an event from a financial data source, classify it by:
1. **severity**: CRITICAL | HIGH | MEDIUM | LOW — how market-moving is this event?
2. **direction**: BULLISH | BEARISH | NEUTRAL | MIXED — estimate the likely immediate market reaction
3. **eventType**: choose exactly one of these labels: ${EVENT_TYPE_LIST}
4. **confidence**: 0 to 1 — how confident are you in this classification?
5. **reasoning**: 1-3 sentence explanation of your classification
6. **tags**: array of relevant string tags
7. **priority**: 0-100 — lower number = higher priority

SEVERITY CALIBRATION:
- CRITICAL: Trading halts, FDA drug approvals/rejections, major M&A (>$1B), presidential executive orders affecting specific sectors, earnings surprises >20%, record-breaking buybacks (>$50B), bankruptcy filings of major companies. These events move prices 5%+ immediately.
- HIGH: SEC insider trading (Form 4 large transactions >$1M), analyst upgrades/downgrades from major firms, earnings surprises 5-20%, significant regulatory actions, major stock buybacks (>$1B), significant dividend changes, stock splits, large acquisitions (<$1B), CEO/CFO departures at major companies. These events move prices 2-5%.
- MEDIUM: Routine SEC filings (10-Q, 10-K), earnings in-line with estimates, industry reports, moderate news. Prices may move 0.5-2%.
- LOW: Social media trending without news catalyst, routine corporate updates, conference presentations, minor regulatory filings. Minimal price impact expected.

CONFIDENCE CALIBRATION:
- Use the FULL range 0.3 to 0.95
- 0.9+ = unambiguous event with clear market impact (e.g., trading halt, FDA decision)
- 0.7-0.9 = likely classification but some ambiguity
- 0.5-0.7 = uncertain, could go either way
- 0.3-0.5 = best guess, limited information
- NEVER output 1.0 or 0.0

DIRECTION CALIBRATION:
- "Trump postpones military strikes, peace talks" → BULLISH (de-escalation = risk-on)
- "Trump threatens Iran with military action" → BEARISH (escalation = risk-off)
- "Tariffs imposed on China 25%" → BEARISH (trade war = uncertainty)
- "Trade deal reached with China" → BULLISH (resolution = certainty)
- "Fed raises rates by 50bp" → BEARISH (tightening)
- "Fed cuts rates" → BULLISH (easing)
- "SEC approves Bitcoin ETF" → BULLISH for crypto
- "Company bankruptcy filing" → BEARISH for that ticker
- Military conflict, war escalation, missile strikes → BEARISH for equities, BULLISH for oil/gold/defense
- Peace talks, ceasefire, de-escalation → BULLISH for equities, BEARISH for oil/gold/defense
- If event involves military action or war, NEVER classify as NEUTRAL
- "Iran attacks energy facilities" → BEARISH (war escalation = risk-off)
- "Trump postpones Iran strikes, cites talks" → BULLISH (de-escalation = risk-on)
- "Strait of Hormuz blocked" → BEARISH (oil supply crisis)
- "Ceasefire agreement reached" → BULLISH (risk-on)
- "Sanctions imposed on country X" → BEARISH (trade disruption)
- "Sanctions lifted on country X" → BULLISH (trade opening)

For macro, policy, and geopolitical events, assess the likely market-wide impact first:
- De-escalation, easing, improved certainty, or supportive policy = risk-on / more BULLISH
- Escalation, tightening, tariffs, sanctions, war risk, or policy uncertainty = risk-off / more BEARISH
- Use NEUTRAL only when the event is informational with no clear directional read
- Use MIXED when the impact is clearly split across sectors or assets

Respond ONLY with valid JSON. No markdown, no code fences, no extra text.`;

const POLITICAL_POST_PROMPT = `POLITICAL POST CLASSIFICATION:
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

TRUTH SOCIAL / PRESIDENTIAL POST EXAMPLES:
- "I HAVE INSTRUCTED THE DEPARTMENT OF WAR TO POSTPONE MILITARY STRIKES" → CRITICAL (concrete military action)
- "WE WILL PUT TARIFFS OF 25% ON ALL GOODS FROM CHINA" → CRITICAL (specific trade action with numbers)
- "THE FED SHOULD LOWER INTEREST RATES" → MEDIUM (opinion, not action)
- "MAKE AMERICA GREAT AGAIN!!!" → LOW (slogan, no market impact)
- "PEACE THROUGH STRENGTH!!!" → LOW (slogan, no specific action)
- "THE DEMOCRATS ARE DESTROYING THIS COUNTRY" → LOW (political commentary)`;

function isPoliticalPostSource(source: RawEvent['source']): boolean {
  return source === 'truth-social';
}

export function buildClassificationPrompt(
  event: RawEvent,
  _ruleResult?: ClassificationResult,
): string {
  void _ruleResult;
  const parts: string[] = [SYSTEM_PROMPT];

  if (isPoliticalPostSource(event.source)) {
    parts.push('', POLITICAL_POST_PROMPT);
  }

  parts.push('', '--- EVENT ---');

  parts.push(`Source: ${event.source}`);
  parts.push(`Type: ${event.type}`);
  parts.push(`Title: ${event.title}`);

  if (event.body) {
    const truncatedBody = event.body.length > 2000
      ? event.body.slice(0, 2000) + '...'
      : event.body;
    parts.push(`Body: ${truncatedBody}`);
  }

  if (event.url) {
    parts.push(`URL: ${event.url}`);
  }

  if (event.metadata && Object.keys(event.metadata).length > 0) {
    parts.push(`Metadata: ${JSON.stringify(event.metadata)}`);
  }

  parts.push(`Timestamp: ${event.timestamp.toISOString()}`);

  parts.push('', '--- OUTPUT FORMAT ---');
  parts.push('Respond with JSON: { "severity", "direction", "eventType", "confidence", "reasoning", "tags", "priority" }');

  return parts.join('\n');
}

export function parseLlmResponse(
  raw: string,
  ruleResult?: ClassificationResult,
): Result<LlmClassificationResult, Error> {
  try {
    // Try to extract JSON from the response (handle possible code fences)
    let jsonStr = raw.trim();

    // Strip markdown code fences if present
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    // Merge in matchedRules from rule engine
    if (ruleResult) {
      parsed.matchedRules = ruleResult.matchedRules;
    } else {
      parsed.matchedRules = parsed.matchedRules ?? [];
    }

    const validated = LlmClassificationResultSchema.safeParse(parsed);
    if (!validated.success) {
      return err(new Error(`LLM response validation failed: ${validated.error.message}`));
    }

    return ok(validated.data);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
