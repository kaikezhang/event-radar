# Event Radar

Real-time event-driven trading intelligence platform. Monitors 30+ sources (SEC filings, political social media, macro data), classifies events with AI, and pushes alerts to iOS/Telegram/Discord/Dashboard.

## Tech Stack

TypeScript monorepo (Turborepo). Backend: Fastify. Frontend: Next.js 15 + shadcn/ui + Tailwind. DB: PostgreSQL. Testing: Vitest + Playwright. SEC parsing: Python microservice (FastAPI + edgartools).

## Structure

```
packages/shared/     — types, interfaces, schemas (zod)
packages/backend/    — Fastify server, scanners, pipeline, delivery
packages/frontend/   — Next.js 15 dashboard
packages/sec-service/— Python FastAPI microservice
```

## Commands

- `turbo build` — build all packages
- `turbo test` — run all tests (Vitest)
- `turbo lint` — ESLint check
- `docker compose up` — start all services locally

## Key Constraints

- Use zod for all validation. Result<T,E> pattern for errors, don't throw.
- Env vars via `@t3-oss/env-core`. Never hardcode secrets.
- One scanner per file. Scanners only extract data — no classification logic.
- Virtual list: @tanstack/virtual (NOT AG Grid). DB: PostgreSQL (NOT SQLite).
- Event bus interface: EventEmitter now, Redis Streams later. Don't couple to implementation.

## Verification

After any change: `turbo build && turbo test && turbo lint` must all pass.

## Tasks

Read `tasks.md` for current task and development plan.

## Current Task: P1B.1 LLM Classification Engine

**Goal**: Add an AI-powered classifier that supplements the existing rule engine with LLM reasoning.

### Architecture

The LLM classifier runs **after** the rule engine as a second classification stage. The rule engine provides instant results; the LLM enriches with reasoning, refined severity, direction signal, and event type.

### Requirements

1. **`LlmClassifier` class** in `src/pipeline/llm-classifier.ts`
   - Input: `RawEvent` + optional `ClassificationResult` from rule engine
   - Output: `LlmClassificationResult` (extends ClassificationResult with `reasoning`, `direction`, `eventType`, `confidence`)
   - Uses structured prompt with event context → asks LLM to classify

2. **New shared types** in `packages/shared/src/schemas/llm-classification.ts`
   ```typescript
   LlmClassificationResult {
     severity: Severity
     direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'MIXED'
     eventType: string  // e.g. 'insider_purchase', 'restructuring', 'executive_change'
     confidence: number // 0-1
     reasoning: string  // LLM's explanation
     tags: string[]
     priority: number
     matchedRules: string[]  // from rule engine (passthrough)
   }
   ```

3. **LLM provider abstraction** in `src/pipeline/llm-provider.ts`
   - Interface: `LlmProvider { complete(prompt: string): Promise<Result<string, Error>> }`
   - Implement `AnthropicProvider` (Claude API via `@anthropic-ai/sdk`)
   - Implement `OpenAIProvider` (GPT API via `openai` SDK)
   - Provider selected via env var `LLM_PROVIDER=anthropic|openai`
   - Model selected via env var `LLM_MODEL` (default: `claude-sonnet-4-20250514`)

4. **Structured prompt** in `src/pipeline/classification-prompt.ts`
   - System prompt: "You are a financial event classifier..."
   - Include event source, title, body, metadata, URL
   - Ask for JSON output: severity, direction, eventType, confidence, reasoning
   - Parse response with zod validation

5. **Backpressure & concurrency** in `src/pipeline/llm-queue.ts`
   - Max concurrent LLM requests: configurable (default 3)
   - Priority queue: Tier 1 sources before Tier 4
   - Timeout per request: 30s
   - Fallback: if LLM fails/times out, use rule engine result only

6. **Pipeline integration**
   - Update the pipeline to run: rule engine → LLM classifier (async)
   - Rule engine result is returned immediately for fast delivery
   - LLM result updates the event classification asynchronously
   - Add `classification_source` field: 'rule' | 'llm' | 'both'

7. **Tests** (≥8 new tests)
   - Unit tests for prompt construction
   - Unit tests for response parsing (valid JSON, malformed, timeout)
   - Integration test: mock LLM provider → full pipeline
   - Test backpressure: queue fills up, oldest low-priority dropped
   - Test fallback: LLM timeout → rule engine result used

### Dependencies to add
- `@anthropic-ai/sdk` in packages/backend
- `openai` in packages/backend

### Files to create/modify
- `packages/shared/src/schemas/llm-classification.ts` (new)
- `packages/shared/src/index.ts` (export new types)
- `packages/backend/src/pipeline/llm-provider.ts` (new)
- `packages/backend/src/pipeline/llm-classifier.ts` (new)
- `packages/backend/src/pipeline/classification-prompt.ts` (new)
- `packages/backend/src/pipeline/llm-queue.ts` (new)
- `packages/backend/src/__tests__/llm-classifier.test.ts` (new)

### Verification
`turbo build && turbo test && turbo lint` must pass.

## Reference Docs

Read these when working on the relevant area:

- `docs/ARCHITECTURE.md` — system design, event bus, backpressure, Python/TS boundary, auth
- `docs/SOURCES.md` — all 30+ data sources by tier
- `docs/FRONTEND.md` — dashboard panels, UX spec, keyboard shortcuts
- `docs/DELIVERY.md` — Bark/Telegram/Discord/webhook alert routing
- `docs/ROADMAP.md` — phased development plan with milestones
- `docs/REFERENCES.md` — open-source projects to integrate
- `docs/REVIEW.md` — architecture review findings

## Git

Conventional Commits: `feat(scanner): add SEC 8-K polling`. Branch: `feat/`, `fix/`, `docs/`. Squash merge PRs. Never push directly to main for non-trivial changes.
