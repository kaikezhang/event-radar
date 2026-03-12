import type { FastifyInstance } from 'fastify';
import { requireApiKey } from './auth-middleware.js';
import { RuleEngine } from '../pipeline/rule-engine.js';
import { LLMClassifierService, type ClassifyResponse } from '../services/llm-classifier.js';
import type { LLMProvider } from '../services/llm-provider.js';
import type { Rule, RawEvent } from '@event-radar/shared';
import { randomUUID } from 'node:crypto';

const ClassifyBodySchema = {
  type: 'object',
  required: ['headline'],
  properties: {
    headline: { type: 'string', minLength: 1 },
    content: { type: 'string' },
    source: { type: 'string' },
    ticker: { type: 'string' },
  },
} as const;

interface ClassifyRouteOptions {
  apiKey?: string;
  llmProvider: LLMProvider;
  rules?: Rule[];
}

export function registerClassifyRoute(
  server: FastifyInstance,
  options: ClassifyRouteOptions,
): void {
  const ruleEngine = new RuleEngine();
  if (options.rules) {
    ruleEngine.loadRules(options.rules);
  }

  const llmClassifier = new LLMClassifierService({
    provider: options.llmProvider,
  });

  const withAuth = async (
    request: Parameters<typeof requireApiKey>[0],
    reply: Parameters<typeof requireApiKey>[1],
  ) => requireApiKey(request, reply, options.apiKey);

  server.post<{
    Body: { headline: string; content?: string; source?: string; ticker?: string };
  }>('/api/v1/classify', {
    schema: { body: ClassifyBodySchema },
    preHandler: withAuth,
  }, async (request) => {
    const { headline, content, source, ticker } = request.body;

    // Build a RawEvent for the rule engine
    const syntheticEvent: RawEvent = {
      id: randomUUID(),
      source: source ?? 'manual',
      type: 'classify-api',
      title: headline,
      body: content ?? '',
      timestamp: new Date(),
      metadata: ticker ? { ticker } : undefined,
    };

    // 1. Run rule engine
    const ruleResult = ruleEngine.classify(syntheticEvent);

    // 2. Check if LLM should be used
    const useLLM = llmClassifier.shouldUseLLM(syntheticEvent, ruleResult);

    let llmResult: ClassifyResponse['llm'];
    let method: ClassifyResponse['method'] = 'rule';

    if (useLLM) {
      const result = await llmClassifier.classify({
        headline,
        content,
        source,
        ticker,
      });

      if (result.ok) {
        llmResult = result.value;
        method = 'llm';
      }
      // If LLM fails, fall back to rule engine
    }

    // 3. Build final result
    const finalResult: ClassifyResponse['final'] = llmResult
      ? {
          severity: llmResult.severity,
          tags: ruleResult.tags,
          priority: ruleResult.priority,
          matchedRules: ruleResult.matchedRules,
          confidence: llmResult.confidence,
          direction: llmResult.direction,
          eventType: llmResult.eventType,
          reasoning: llmResult.reasoning,
        }
      : { ...ruleResult };

    const response: ClassifyResponse = {
      rule: ruleResult,
      llm: llmResult,
      final: finalResult,
      method,
    };

    return response;
  });
}
