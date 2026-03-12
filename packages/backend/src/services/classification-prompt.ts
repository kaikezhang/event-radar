import { LLMClassificationSchema, type LLMClassification } from '@event-radar/shared';
import { ok, err, type Result } from '@event-radar/shared';
import { LLMError } from './llm-provider.js';

const FEW_SHOT_EXAMPLES = `
Example 1:
Event: "AAPL files 8-K: CEO Tim Cook announces retirement effective Q3 2025"
Output: {"eventType":"filing","severity":"CRITICAL","direction":"bearish","confidence":0.9,"reasoning":"CEO departure from top-5 market cap company is highly material."}

Example 2:
Event: "Fed holds rates steady at 5.25-5.50%, signals possible cut in September"
Output: {"eventType":"macro","severity":"HIGH","direction":"bullish","confidence":0.85,"reasoning":"Rate hold with dovish forward guidance is broadly bullish for equities."}

Example 3:
Event: "Senator purchases $500K in defense stocks ahead of committee vote"
Output: {"eventType":"political","severity":"MEDIUM","direction":"bullish","confidence":0.7,"reasoning":"Congressional insider trading pattern suggests upcoming favorable legislation."}
`.trim();

export function buildClassifyPrompt(input: {
  headline: string;
  content?: string;
  source?: string;
  ticker?: string;
}): string {
  const parts: string[] = [
    'You are a financial event classifier. Classify the following event.',
    '',
    'Return ONLY valid JSON with these fields:',
    '- eventType: filing|earnings|insider|macro|political|analyst|social',
    '- severity: LOW|MEDIUM|HIGH|CRITICAL',
    '- direction: bullish|bearish|neutral',
    '- confidence: 0.0-1.0',
    '- reasoning: one sentence explanation',
    '',
    FEW_SHOT_EXAMPLES,
    '',
    '--- EVENT ---',
    `Headline: ${input.headline}`,
  ];

  if (input.content) {
    const truncated = input.content.length > 1500
      ? input.content.slice(0, 1500) + '...'
      : input.content;
    parts.push(`Content: ${truncated}`);
  }

  if (input.source) {
    parts.push(`Source: ${input.source}`);
  }

  if (input.ticker) {
    parts.push(`Ticker: ${input.ticker}`);
  }

  parts.push('', 'Output:');

  return parts.join('\n');
}

export function parseLLMClassification(raw: string): Result<LLMClassification, LLMError> {
  try {
    let jsonStr = raw.trim();

    // Strip markdown code fences if present
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const validated = LLMClassificationSchema.safeParse(parsed);

    if (!validated.success) {
      return err(new LLMError(
        `LLM response validation failed: ${validated.error.message}`,
        'parse_error',
      ));
    }

    return ok(validated.data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(new LLMError(`Failed to parse LLM response: ${message}`, 'parse_error'));
  }
}
