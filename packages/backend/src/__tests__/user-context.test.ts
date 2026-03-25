import { describe, it, expect } from 'vitest';
import { resolveRequestUserId, DEFAULT_USER_ID } from '../utils/request-user.js';
import type { FastifyRequest } from 'fastify';

function fakeRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    headers: {},
    ...overrides,
  } as unknown as FastifyRequest;
}

describe('resolveRequestUserId', () => {
  it('returns request.userId when set', () => {
    const request = fakeRequest({ userId: 'user@example.com' });
    expect(resolveRequestUserId(request)).toBe('user@example.com');
  });

  it('returns DEFAULT_USER_ID when request.userId is not set', () => {
    const request = fakeRequest();
    expect(resolveRequestUserId(request)).toBe(DEFAULT_USER_ID);
  });

  it('ignores x-user-id header even when API-key authenticated', () => {
    const request = fakeRequest({
      headers: { 'x-user-id': 'attacker' },
      userId: 'default',
      apiKeyAuthenticated: true,
    });
    expect(resolveRequestUserId(request)).toBe('default');
  });

  it('ignores x-user-id header when userId is not set', () => {
    const request = fakeRequest({
      headers: { 'x-user-id': 'attacker' },
    });
    expect(resolveRequestUserId(request)).toBe(DEFAULT_USER_ID);
  });

  it('ignores x-user-id header for JWT-authenticated user', () => {
    const request = fakeRequest({
      headers: { 'x-user-id': 'attacker' },
      userId: 'real-user@example.com',
    });
    expect(resolveRequestUserId(request)).toBe('real-user@example.com');
  });
});
