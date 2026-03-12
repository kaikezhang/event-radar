import type { LLMProvider } from '../services/llm-provider.js';

export interface GatekeeperResult {
  pass: boolean;
  reason: string;
  confidence: number;
}

const SYSTEM_PROMPT = `You are a news quality filter for a real-time stock market alert system.

Your job: decide if a headline is ACTIONABLE BREAKING NEWS that a trader needs to see RIGHT NOW.

PASS (respond "PASS") if:
- Breaking event: crash, halt, FDA decision, acquisition announced, sanctions imposed
- First-hand report of something that JUST happened
- Government action with immediate market impact
- Specific company event (earnings miss/beat, executive departure, fraud discovered)

BLOCK (respond "BLOCK") if:
- Opinion piece, analysis, or commentary ("worried about...", "here's why...", "this 1 move...")
- Clickbait or advisory content ("make or break", "before it's too late", "you need to know")
- Retrospective article explaining something that already happened
- Generic market commentary without specific new information
- Investment advice or portfolio tips
- Listicles ("top 10 stocks", "best buys")
- Predictions or forecasts without new data

Respond with EXACTLY one line in this format:
PASS|BLOCK <confidence 0.0-1.0> <brief reason>

Examples:
PASS 0.95 FDA approves new Pfizer drug for Alzheimer's
BLOCK 0.90 clickbait opinion piece, no new information
PASS 0.85 Trump signs executive order imposing 25% tariffs on EU
BLOCK 0.95 retrospective analysis of why stock dropped yesterday`;

/**
 * LLM-powered quality gate for breaking news alerts.
 * Runs BEFORE delivery to filter out clickbait, opinions, and noise.
 * 
 * Design: fast, cheap, fire-and-forget if LLM fails (default: pass through).
 */
export class LLMGatekeeper {
  private readonly provider: LLMProvider | undefined;
  readonly enabled: boolean;
  private readonly timeoutMs: number;

  constructor(options?: { provider?: LLMProvider; enabled?: boolean; timeoutMs?: number }) {
    this.provider = options?.provider;
    this.enabled = options?.enabled ?? (options?.provider != null && options.provider.name !== 'mock');
    this.timeoutMs = options?.timeoutMs ?? 5000;
  }

  /**
   * Check if a headline should pass through to delivery.
   * Returns { pass: true } on LLM failure (fail-open to avoid blocking real alerts).
   */
  async check(title: string, body?: string): Promise<GatekeeperResult> {
    if (!this.enabled || !this.provider) {
      return { pass: true, reason: 'gatekeeper disabled', confidence: 0 };
    }

    const headline = body && body !== title
      ? `${title}\n${body.slice(0, 200)}`
      : title;

    const prompt = `${SYSTEM_PROMPT}\n\nHeadline to evaluate:\n${headline}`;

    try {
      const result = await Promise.race([
        this.provider.classify(prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('gatekeeper timeout')), this.timeoutMs),
        ),
      ]);

      if (!result.ok) {
        // LLM error — fail open
        return { pass: true, reason: `llm error: ${result.error.message}`, confidence: 0 };
      }

      return this.parseResponse(result.value);
    } catch (err) {
      // Timeout or other error — fail open
      return { pass: true, reason: `gatekeeper error: ${err instanceof Error ? err.message : 'unknown'}`, confidence: 0 };
    }
  }

  private parseResponse(text: string): GatekeeperResult {
    const line = text.trim().split('\n')[0]?.trim() ?? '';
    const match = line.match(/^(PASS|BLOCK)\s+([\d.]+)\s+(.+)/i);

    if (!match) {
      // Can't parse — fail open
      return { pass: true, reason: `unparseable response: ${line.slice(0, 100)}`, confidence: 0 };
    }

    const [, decision, confStr, reason] = match;
    const pass = decision!.toUpperCase() === 'PASS';
    const confidence = Math.min(1, Math.max(0, Number(confStr) || 0));

    return { pass, reason: reason!.trim(), confidence };
  }
}
