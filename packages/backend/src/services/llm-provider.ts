import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ok, err, type Result } from '@event-radar/shared';

export interface LLMProvider {
  name: string;
  classify(prompt: string): Promise<Result<string, LLMError>>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: 'timeout' | 'rate_limit' | 'api_error' | 'parse_error',
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.client = new OpenAI({ apiKey: options?.apiKey });
    this.model = options?.model ?? 'gpt-4o-mini';
  }

  async classify(prompt: string): Promise<Result<string, LLMError>> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
      });

      const text = response.choices[0]?.message?.content;
      if (!text) {
        return err(new LLMError('Empty response from OpenAI', 'api_error'));
      }

      return ok(text);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(new LLMError(message, 'api_error'));
    }
  }
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.client = new Anthropic({ apiKey: options?.apiKey });
    this.model = options?.model ?? 'claude-haiku-4-5-20251001';
  }

  async classify(prompt: string): Promise<Result<string, LLMError>> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      });

      const block = response.content[0];
      if (block?.type !== 'text') {
        return err(new LLMError('Unexpected response type from Anthropic', 'api_error'));
      }

      return ok(block.text);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(new LLMError(message, 'api_error'));
    }
  }
}

export class MockProvider implements LLMProvider {
  readonly name = 'mock';
  private readonly presetResponse: Result<string, LLMError>;

  constructor(response?: Result<string, LLMError>) {
    this.presetResponse = response ?? ok(JSON.stringify({
      eventType: 'filing',
      severity: 'MEDIUM',
      direction: 'neutral',
      confidence: 0.75,
      reasoning: 'Mock classification result for testing.',
    }));
  }

  async classify(): Promise<Result<string, LLMError>> {
    return this.presetResponse;
  }
}

export function createLLMProvider(providerName?: string): LLMProvider {
  const provider = providerName ?? process.env.LLM_PROVIDER ?? 'mock';

  switch (provider) {
    case 'openai':
      return new OpenAIProvider();
    case 'anthropic':
      return new AnthropicProvider();
    case 'mock':
      return new MockProvider();
    default:
      return new MockProvider();
  }
}
