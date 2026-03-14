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
2. **direction**: BULLISH | BEARISH | NEUTRAL | MIXED — what is the likely price impact?
3. **eventType**: choose exactly one of these labels: ${EVENT_TYPE_LIST}
4. **confidence**: 0 to 1 — how confident are you in this classification?
5. **reasoning**: 1-3 sentence explanation of your classification
6. **tags**: array of relevant string tags
7. **priority**: 0-100 — lower number = higher priority

Respond ONLY with valid JSON. No markdown, no code fences, no extra text.`;

export function buildClassificationPrompt(
  event: RawEvent,
  ruleResult?: ClassificationResult,
): string {
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

  if (ruleResult) {
    parts.push('', '--- RULE ENGINE RESULT (for context) ---');
    parts.push(`Rule Severity: ${ruleResult.severity}`);
    parts.push(`Rule Tags: ${ruleResult.tags.join(', ') || 'none'}`);
    parts.push(`Rule Priority: ${ruleResult.priority}`);
    parts.push(`Matched Rules: ${ruleResult.matchedRules.join(', ') || 'none'}`);
  }

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
