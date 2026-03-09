import {
  err,
  type Result,
  type RawEvent,
  type ClassificationResult,
  type LlmClassificationResult,
} from '@event-radar/shared';
import type { LlmProvider } from './llm-provider.js';
import { LlmQueue, type LlmQueueOptions } from './llm-queue.js';
import { buildClassificationPrompt, parseLlmResponse } from './classification-prompt.js';

export interface LlmClassifierOptions {
  provider: LlmProvider;
  queue?: LlmQueueOptions;
}

export class LlmClassifier {
  private readonly provider: LlmProvider;
  private readonly queue: LlmQueue;

  constructor(options: LlmClassifierOptions) {
    this.provider = options.provider;
    this.queue = new LlmQueue(
      (prompt) => this.provider.complete(prompt),
      options.queue,
    );
  }

  async classify(
    event: RawEvent,
    ruleResult?: ClassificationResult,
  ): Promise<Result<LlmClassificationResult, Error>> {
    const prompt = buildClassificationPrompt(event, ruleResult);
    const priority = ruleResult?.priority ?? 50;

    const llmResult = await this.queue.enqueue(prompt, priority);
    if (!llmResult.ok) {
      return err(llmResult.error);
    }

    return parseLlmResponse(llmResult.value, ruleResult);
  }

  get pendingCount(): number {
    return this.queue.pending;
  }

  get activeCount(): number {
    return this.queue.active;
  }
}
