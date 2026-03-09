import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ok, err, type Result } from '@event-radar/shared';

export interface LlmProvider {
  complete(prompt: string): Promise<Result<string, Error>>;
}

export class AnthropicProvider implements LlmProvider {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.client = new Anthropic({ apiKey: options?.apiKey });
    this.model = options?.model ?? 'claude-sonnet-4-20250514';
  }

  async complete(prompt: string): Promise<Result<string, Error>> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const block = response.content[0];
      if (block?.type !== 'text') {
        return err(new Error('Unexpected response type from Anthropic'));
      }

      return ok(block.text);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }
}

export class OpenAIProvider implements LlmProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.client = new OpenAI({ apiKey: options?.apiKey });
    this.model = options?.model ?? 'gpt-4o';
  }

  async complete(prompt: string): Promise<Result<string, Error>> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
      });

      const text = response.choices[0]?.message?.content;
      if (!text) {
        return err(new Error('Empty response from OpenAI'));
      }

      return ok(text);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }
}

export function createLlmProvider(): LlmProvider {
  const provider = process.env.LLM_PROVIDER ?? 'anthropic';
  const model = process.env.LLM_MODEL;

  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider({ model: model ?? undefined });
    case 'openai':
      return new OpenAIProvider({ model: model ?? undefined });
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${provider}. Expected 'anthropic' or 'openai'.`);
  }
}
