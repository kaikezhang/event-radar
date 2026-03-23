import {
  err,
  type Result,
  type RawEvent,
  type ClassificationResult,
  type LLMClassification,
  type LLMClassificationMethod,
} from '@event-radar/shared';
import { type LLMProvider, LLMError } from './llm-provider.js';
import { buildClassifyPrompt, parseLLMClassification } from './classification-prompt.js';
import { shouldForcePoliticalLlmClassification } from '../pipeline/political-llm-policy.js';

export interface ClassifyInput {
  headline: string;
  content?: string;
  source?: string;
  ticker?: string;
  metadata?: Record<string, unknown>;
}

export interface ClassifyResponse {
  rule: ClassificationResult;
  llm?: LLMClassification;
  final: ClassificationResult & { direction?: string; eventType?: string; reasoning?: string };
  method: LLMClassificationMethod;
}

// Sliding window rate limiter
class SlidingWindowRateLimiter {
  private readonly timestamps: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  tryAcquire(): boolean {
    const now = Date.now();
    // Remove expired timestamps
    while (this.timestamps.length > 0 && this.timestamps[0] <= now - this.windowMs) {
      this.timestamps.shift();
    }

    if (this.timestamps.length >= this.maxRequests) {
      return false;
    }

    this.timestamps.push(now);
    return true;
  }

  get pendingCount(): number {
    const now = Date.now();
    return this.timestamps.filter((t) => t > now - this.windowMs).length;
  }
}

export interface LLMClassifierServiceOptions {
  provider: LLMProvider;
  maxRequestsPerMinute?: number;
  timeoutMs?: number;
}

export class LLMClassifierService {
  private readonly provider: LLMProvider;
  private readonly rateLimiter: SlidingWindowRateLimiter;
  private readonly timeoutMs: number;

  constructor(options: LLMClassifierServiceOptions) {
    this.provider = options.provider;
    this.rateLimiter = new SlidingWindowRateLimiter(
      options.maxRequestsPerMinute ?? 10,
      60_000,
    );
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  shouldUseLLM(event: RawEvent, ruleResult: ClassificationResult): boolean {
    if (shouldForcePoliticalLlmClassification(ruleResult)) {
      return true;
    }

    // Rule engine confidence < 0.6 → use LLM
    if (ruleResult.confidence < 0.6) {
      return true;
    }

    // Event from reclassification queue
    if (event.metadata?.['reclassification'] === true) {
      return true;
    }

    // Rule engine returned UNKNOWN type
    if (
      ruleResult.tags.includes('unknown') ||
      ruleResult.matchedRules.length === 0
    ) {
      return true;
    }

    // High-impact sources always go through LLM for accurate severity classification
    const highImpactSources = ['truth-social', 'whitehouse'];
    if (highImpactSources.includes(event.source)) {
      return true;
    }

    return false;
  }

  async classify(
    input: ClassifyInput,
  ): Promise<Result<LLMClassification, LLMError>> {
    // Check rate limit
    if (!this.rateLimiter.tryAcquire()) {
      return err(new LLMError('Rate limit exceeded (10 req/min)', 'rate_limit'));
    }

    const prompt = buildClassifyPrompt(input);

    // Apply timeout
    const result = await Promise.race([
      this.provider.classify(prompt),
      new Promise<Result<string, LLMError>>((resolve) =>
        setTimeout(
          () => resolve(err(new LLMError('LLM request timed out', 'timeout'))),
          this.timeoutMs,
        ),
      ),
    ]);

    if (!result.ok) {
      return result as Result<never, LLMError>;
    }

    return parseLLMClassification(result.value);
  }

  get providerName(): string {
    return this.provider.name;
  }

  get currentRateUsage(): number {
    return this.rateLimiter.pendingCount;
  }
}
