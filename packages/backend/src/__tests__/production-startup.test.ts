import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const buildAppMock = vi.fn();
const createDbMock = vi.fn();

vi.mock('../app.js', () => ({
  buildApp: buildAppMock,
}));

vi.mock('../db/connection.js', () => ({
  createDb: createDbMock,
}));

describe('production startup wiring', () => {
  const originalAuthRequired = process.env.AUTH_REQUIRED;
  const processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    delete process.env.AUTH_REQUIRED;
    delete process.env.DATABASE_URL;
    delete process.env.API_KEY;
    delete process.env.LLM_MODEL;
    delete process.env.OPENAI_API_KEY;

    buildAppMock.mockReturnValue({
      server: {
        listen: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      },
      registry: {
        startAll: vi.fn(),
        stopAll: vi.fn(),
        healthAll: vi.fn().mockReturnValue([]),
      },
    });
  });

  afterEach(() => {
    if (originalAuthRequired === undefined) {
      delete process.env.AUTH_REQUIRED;
    } else {
      process.env.AUTH_REQUIRED = originalAuthRequired;
    }
  });

  afterAll(() => {
    processOnSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('passes an OpenAI LLM provider to buildApp when OPENAI_API_KEY is set', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';

    await import('../index.js');

    await vi.waitFor(() => {
      expect(buildAppMock).toHaveBeenCalledTimes(1);
    });

    const options = buildAppMock.mock.calls[0]?.[0] as { llmProvider?: unknown };
    expect(options.llmProvider).toBeDefined();
    expect((options.llmProvider as { constructor?: { name?: string } }).constructor?.name).toBe('OpenAIProvider');
    expect((options.llmProvider as { model?: string }).model).toBe('gpt-4o-mini');
  });

  it('does not pass an LLM provider when OPENAI_API_KEY is missing', async () => {
    await import('../index.js');

    await vi.waitFor(() => {
      expect(buildAppMock).toHaveBeenCalledTimes(1);
    });

    const options = buildAppMock.mock.calls[0]?.[0] as { llmProvider?: unknown };
    expect(options.llmProvider).toBeUndefined();
  });
});
