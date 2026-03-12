# Current Task: P1B.1 — LLM 分类引擎 (Stage 2)

## Goal
用 LLM (Claude/GPT) 对低置信度事件进行智能分类，补充现有规则引擎。规则引擎快但粗，LLM 慢但准，两者协作。

## Requirements

### 1. LLM Classification Service (`packages/backend/src/services/llm-classifier.ts`)
- `LLMClassifierService` class
- `classify(event: RawEvent): Promise<Result<ClassificationResult, ClassificationError>>`
  - 构造 prompt: 事件标题 + 内容摘要 + source + ticker（如有）
  - 调用 LLM API 获取分类结果
  - Parse LLM 响应为结构化 `ClassificationResult`
- `shouldUseLLM(event: RawEvent, ruleResult: RuleClassification): boolean`
  - 规则引擎 confidence < 0.6 → 用 LLM
  - 事件来自 P4.3.4 reclassification queue → 用 LLM
  - 规则引擎返回 UNKNOWN type → 用 LLM
- 支持多 provider: `openai` | `anthropic`（通过 env var 配置）
- Rate limiting: 最多 10 req/min（防费用爆炸）
- Timeout: 单次请求 15s
- Fallback: LLM 失败 → 降级到规则引擎结果

### 2. LLM Provider Abstraction (`packages/backend/src/services/llm-provider.ts`)
- `LLMProvider` interface:
  ```typescript
  interface LLMProvider {
    name: string;
    classify(prompt: string): Promise<Result<string, LLMError>>;
  }
  ```
- `OpenAIProvider`: 用 GPT-4o-mini（便宜快）
- `AnthropicProvider`: 用 Claude Haiku（备选）
- `MockProvider`: 测试用，返回预设结果
- Provider 通过 env var `LLM_PROVIDER` 选择，默认 `mock`

### 3. Classification Prompt (`packages/backend/src/services/classification-prompt.ts`)
- 构造分类 prompt，要求 LLM 返回 JSON：
  ```json
  {
    "eventType": "filing|earnings|insider|macro|political|analyst|social",
    "severity": "LOW|MEDIUM|HIGH|CRITICAL",
    "direction": "bullish|bearish|neutral",
    "confidence": 0.0-1.0,
    "reasoning": "one sentence explanation"
  }
  ```
- 包含 few-shot examples（3-5 个典型事件）
- 限制 token 使用（max_tokens: 200）

### 4. Pipeline Integration
- 在 classification pipeline 中：
  1. 先跑规则引擎
  2. `shouldUseLLM()` → true → 调用 LLM
  3. LLM 结果覆盖规则引擎结果（但保留两者记录）
- 记录 `classification_method: 'rule' | 'llm'` 到 events 表

### 5. Types (`packages/shared/src/schemas/llm-types.ts`)
```typescript
export const LLMClassificationSchema = z.object({
  eventType: EventTypeSchema,
  severity: SeveritySchema,
  direction: DirectionSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export const ClassificationMethodSchema = z.enum(['rule', 'llm', 'hybrid']);
```

### 6. API Endpoint
- `POST /api/v1/classify` — 手动触发分类（调试用）
  - Body: `{ headline: string, content?: string, source?: string, ticker?: string }`
  - Response: `{ rule: ClassificationResult, llm?: ClassificationResult, final: ClassificationResult, method: 'rule' | 'llm' }`
  - 需要 API key auth

### 7. Tests (≥12 tests)
- shouldUseLLM: low confidence → true
- shouldUseLLM: high confidence → false
- shouldUseLLM: UNKNOWN type → true
- LLM classify: valid response → parsed correctly
- LLM classify: invalid JSON → fallback to rule
- LLM classify: timeout → fallback to rule
- LLM classify: rate limit → queue or skip
- MockProvider: returns preset results
- Prompt construction: includes few-shot examples
- Pipeline: rule high confidence → skip LLM
- Pipeline: rule low confidence → use LLM
- API: classify endpoint returns correct format

### Files to create/modify
- `packages/shared/src/schemas/llm-types.ts`
- `packages/shared/src/index.ts` — export
- `packages/backend/src/services/llm-provider.ts`
- `packages/backend/src/services/llm-classifier.ts`
- `packages/backend/src/services/classification-prompt.ts`
- `packages/backend/src/routes/classify.ts`
- `packages/backend/src/app.ts` — register route
- `packages/backend/src/__tests__/llm-classifier.test.ts`

### Key Constraints
- 不依赖真实 API key 跑测试 — 全用 MockProvider
- Rate limit 用 sliding window（不是 token bucket）
- Prompt 要短（省 token），few-shot 用最典型的 3 个例子

## Verification
- `pnpm build && pnpm --filter @event-radar/backend lint` passes
- All tests pass
- Branch `feat/llm-classifier`, create PR to main
- **DO NOT merge. DO NOT run gh pr merge.**
