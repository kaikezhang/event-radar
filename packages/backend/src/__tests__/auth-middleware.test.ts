import { describe, expect, it } from 'vitest';
import { requireAuth } from '../routes/auth-middleware.js';

function fakeRequest(
  overrides: Partial<{ userId: string; apiKeyAuthenticated: boolean; headers: Record<string, string> }> = {},
) {
  return {
    userId: overrides.userId,
    apiKeyAuthenticated: overrides.apiKeyAuthenticated ?? false,
    headers: overrides.headers ?? {},
  } as unknown as Parameters<typeof requireAuth>[0];
}

function fakeReply() {
  let sentStatus: number | undefined;
  let sentBody: unknown;
  let sent = false;

  return {
    status(code: number) {
      sentStatus = code;
      return this;
    },
    async send(body: unknown) {
      sentBody = body;
      sent = true;
    },
    get sent() {
      return sent;
    },
    get _status() {
      return sentStatus;
    },
    get _body() {
      return sentBody;
    },
  } as Parameters<typeof requireAuth>[1] & { _status: number | undefined; _body: unknown };
}

describe('requireAuth middleware', () => {
  it('rejects request with no userId (anonymous)', async () => {
    const reply = fakeReply();
    await requireAuth(fakeRequest(), reply, 'test-key');
    expect(reply._status).toBe(401);
  });

  it('rejects the default anonymous user', async () => {
    const reply = fakeReply();
    await requireAuth(fakeRequest({ userId: 'default' }), reply, undefined);
    expect(reply._status).toBe(401);
  });

  it('allows authenticated user with real userId', async () => {
    const reply = fakeReply();
    await requireAuth(fakeRequest({ userId: 'user-abc' }), reply, undefined);
    expect(reply._status).toBeUndefined();
  });
});
