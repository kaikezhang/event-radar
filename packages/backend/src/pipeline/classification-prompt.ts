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
2. **direction**: always set to NEUTRAL
3. **eventType**: choose exactly one of these labels: ${EVENT_TYPE_LIST}
4. **confidence**: 0 to 1 — how confident are you in this classification?
5. **reasoning**: 1-3 sentence explanation of your classification
6. **tags**: array of relevant string tags
7. **priority**: 0-100 — lower number = higher priority

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

Set direction to NEUTRAL. Direction prediction is not used in the current version.

Respond ONLY with valid JSON. No markdown, no code fences, no extra text.`;

export function buildClassificationPrompt(
  event: RawEvent,
  _ruleResult?: ClassificationResult,
): string {
  void _ruleResult;
  const parts: string[] = [SYSTEM_PROMPT, '', '--- EVENT ---'];

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
