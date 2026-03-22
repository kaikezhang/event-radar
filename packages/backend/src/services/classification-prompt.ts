import {
  LLMClassificationSchema,
  LLMEventTypeSchema,
  type LLMClassification,
} from '@event-radar/shared';
import { ok, err, type Result } from '@event-radar/shared';
import { LLMError } from './llm-provider.js';

const EVENT_TYPE_LIST = LLMEventTypeSchema.options.join('|');

const FEW_SHOT_EXAMPLES = `
Example 1:
Event: "AAPL files 8-K: CEO Tim Cook announces retirement effective Q3 2025"
Output: {"eventType":"sec_form_8k","severity":"CRITICAL","direction":"bearish","confidence":0.9,"reasoning":"An 8-K filing announcing a CEO departure is highly material."}

Example 2:
Event: "Fed holds rates steady at 5.25-5.50%, signals possible cut in September"
Output: {"eventType":"fed_announcement","severity":"HIGH","direction":"bullish","confidence":0.85,"reasoning":"A Fed decision with dovish forward guidance is broadly bullish for equities."}

Example 3:
Event: "Senator purchases $500K in defense stocks ahead of committee vote"
Output: {"eventType":"insider_large_trade","severity":"MEDIUM","direction":"bullish","confidence":0.7,"reasoning":"A large politically connected trade can signal upcoming policy relevance."}

Example 4:
Source: truth-social
Event: "If Iran doesn't FULLY OPEN the Strait of Hormuz within 48 HOURS, the United States will hit their POWER PLANTS"
Output: {"eventType":"geopolitical_event","severity":"CRITICAL","direction":"bearish","confidence":0.95,"reasoning":"Direct military threat from the US President against Iran is an extreme geopolitical escalation affecting oil, defense, airlines, and broad market risk."}

Example 5:
Source: x
Author: DeItaone
Event: "TESLA Q4 DELIVERIES 495,570 VS EST. 483,173"
Output: {"eventType":"earnings_release","severity":"HIGH","direction":"bullish","confidence":0.9,"reasoning":"Tesla delivery beat is a key metric for TSLA stock. DeItaone is a trusted financial news source."}

Example 6:
Source: x
Author: elonmusk
Event: "💯"
Output: {"eventType":"other","severity":"LOW","direction":"neutral","confidence":0.3,"reasoning":"Single emoji reply with no financial content. Skip."}

Example 7:
Source: x
Author: unusual_whales
Event: "Large $NVDA call sweep: $2.3M in May $180 calls"
Output: {"eventType":"unusual_options","severity":"HIGH","direction":"bullish","confidence":0.8,"reasoning":"Large bullish options activity in NVDA suggests institutional conviction on upside."}

Example 8:
Source: x
Author: elonmusk
Event: "Tesla FSD v13.5 now available to all US customers"
Output: {"eventType":"product_announcement","severity":"HIGH","direction":"bullish","confidence":0.85,"reasoning":"FSD general availability is a major product milestone for Tesla with significant revenue implications."}
`.trim();

const SOURCE_SEVERITY_GUIDELINES = `
IMPORTANT severity guidelines by source:

## truth-social (Trump posts)
The US President's direct statements carry enormous market impact.
- Military threats, sanctions, trade war escalation, tariff announcements → CRITICAL
- Policy statements, executive orders, regulatory threats → HIGH
- Political commentary, personal attacks, endorsements → MEDIUM
- Reposts of news articles, congratulatory messages → LOW

## x (Twitter/X posts) — SPECIAL HANDLING FOR TWEETS
Tweets are SHORT and context-dependent. Classify based on the AUTHOR and CONTENT together.

**By author identity (check metadata.author field):**

@realDonaldTrump (Trump on X): Same rules as truth-social above.

@elonmusk (Elon Musk): Filter aggressively — most tweets are NOT market-relevant.
- Tesla production numbers, delivery updates, FSD announcements → HIGH (ticker: TSLA)
- SpaceX launch updates, Starship milestones → MEDIUM (ticker: RKLB as proxy)
- DOGE/government efficiency policy, federal spending cuts → HIGH
- Crypto/Bitcoin/Dogecoin commentary → MEDIUM
- Memes, jokes, one-word replies ("indeed", "💯", "lol"), personal opinions → LOW (skip these)
- Replies to random users with no financial content → LOW (skip these)

@DeItaone (financial news bot): Almost ALL tweets are market-moving headlines.
- Earnings beats/misses, guidance changes → HIGH or CRITICAL
- Fed/central bank decisions → CRITICAL
- Geopolitical events → HIGH
- M&A announcements → HIGH
- Analyst upgrades/downgrades → MEDIUM
- Default severity for DeItaone: HIGH (not MEDIUM)

@unusual_whales (options activity): Options flow data.
- Large unusual options activity (>$1M premium) → HIGH
- Congress member trades → HIGH
- Regular flow alerts → MEDIUM

@zaborsky (SEC filings): SEC filing alerts.
- 8-K filings, insider trades → HIGH
- Routine filings (10-Q, 10-K) → MEDIUM

@FirstSquawk (breaking news): Breaking financial news.
- Market-moving headlines → HIGH
- Routine economic data → MEDIUM

**Tweet-specific rules:**
- Retweets (RT @...) are LESS important than original tweets — lower severity by 1 tier
- Tweets with $TICKER cashtags: extract the ticker for analysis
- Tweets that are replies to non-notable accounts: usually LOW unless content is independently significant
- Very short tweets (<20 chars) from non-news accounts: usually LOW (memes, reactions)

## whitehouse
Official White House statements → at least HIGH if policy-related

## sec-edgar
SEC filings → severity based on filing type (8-K material events = HIGH/CRITICAL)
`;

export function buildClassifyPrompt(input: {
  headline: string;
  content?: string;
  source?: string;
  ticker?: string;
  metadata?: Record<string, unknown>;
}): string {
  // Extract author from metadata for social media posts
  const author = input.metadata?.['author'] as string | undefined;

  const parts: string[] = [
    'You are a financial event classifier. Classify the following event.',
    '',
    'Return ONLY valid JSON with these fields:',
    `- eventType: ${EVENT_TYPE_LIST}`,
    '- severity: LOW|MEDIUM|HIGH|CRITICAL',
    '- direction: bullish|bearish|neutral',
    '- confidence: 0.0-1.0',
    '- reasoning: one sentence explanation',
    '',
    SOURCE_SEVERITY_GUIDELINES,
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

  if (author) {
    parts.push(`Author: ${author}`);
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
