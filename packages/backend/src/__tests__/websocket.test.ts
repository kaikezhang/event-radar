import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp, type AppContext } from '../app.js';
import { safeCloseServer } from './helpers/test-db.js';
import { connectionTimestamps } from '../plugins/websocket.js';

const TEST_API_KEY = 'test-api-key-12345';

function makeLiveEvent() {
  return {
    id: crypto.randomUUID(),
    title: 'NVDA export filing flags China exposure risk',
    source: 'sec-edgar',
    severity: 'HIGH',
    tickers: ['NVDA'],
    summary: 'NVIDIA flags heightened export exposure tied to China demand.',
    url: 'https://example.com/sec/nvda-export-filing',
    time: '2026-03-13T10:00:00.000Z',
    category: 'filing',
    llmReason: 'China export controls increase downside risk.',
  };
}

async function openSocket(url: string, protocols?: string | string[]): Promise<WebSocket> {
  const socket = new WebSocket(url, protocols);

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('socket connection failed')), {
      once: true,
    });
  });

  return socket;
}

function waitForClose(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    socket.addEventListener(
      'close',
      (event) => resolve({ code: event.code, reason: event.reason }),
      { once: true },
    );
  });
}

async function nextMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    socket.addEventListener(
      'message',
      (event) => {
        try {
          resolve(JSON.parse(String(event.data)));
        } catch (error) {
          reject(error);
        }
      },
      { once: true },
    );
    socket.addEventListener('error', () => reject(new Error('socket errored')), {
      once: true,
    });
  });
}

describe('WebSocket /ws/events', () => {
  let ctx: AppContext;
  let baseWsUrl: string;
  let address: string;

  beforeAll(async () => {
    ctx = buildApp({ logger: false, apiKey: TEST_API_KEY });
    await ctx.server.listen({ port: 0, host: '127.0.0.1' });

    const serverAddress = ctx.server.server.address();
    if (!serverAddress || typeof serverAddress === 'string') {
      throw new Error('expected TCP server address');
    }

    baseWsUrl = `ws://127.0.0.1:${serverAddress.port}/ws/events`;
    address = `${baseWsUrl}?apiKey=${TEST_API_KEY}`;
  });

  afterEach(() => {
    // Clear connection rate limit state between tests
    connectionTimestamps.clear();
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  it('accepts authenticated websocket connections (query string — backward compat)', async () => {
    const socket = await openSocket(address);

    expect(socket.readyState).toBe(WebSocket.OPEN);

    socket.close();
  });

  it('accepts connections via Sec-WebSocket-Protocol subprotocol auth', async () => {
    const socket = await openSocket(baseWsUrl, [`auth.${TEST_API_KEY}`]);

    expect(socket.readyState).toBe(WebSocket.OPEN);

    socket.close();
  });

  it('broadcasts classified events to connected clients', async () => {
    const socket = await openSocket(address);
    const event = makeLiveEvent();

    const messagePromise = nextMessage(socket);
    await ctx.eventBus.publishTopic?.('event:classified', event);

    await expect(messagePromise).resolves.toEqual({
      type: 'event',
      data: event,
    });

    socket.close();
  });

  it('rejects connections with an invalid api key', async () => {
    const socket = new WebSocket(`${baseWsUrl}?apiKey=wrong-key`);

    const closeResult = await waitForClose(socket);

    expect(closeResult.code).toBeGreaterThanOrEqual(1000);
    expect(closeResult.reason).toMatch(/unauthorized/i);
  });

  it('rejects connections with invalid subprotocol auth', async () => {
    const socket = new WebSocket(baseWsUrl, ['auth.wrong-key']);

    const closeResult = await waitForClose(socket);

    expect(closeResult.code).toBeGreaterThanOrEqual(1000);
    expect(closeResult.reason).toMatch(/unauthorized/i);
  });

  it('reports websocket client count in the health response', async () => {
    const socket = await openSocket(address);

    await vi.waitFor(async () => {
      const response = await ctx.server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        websocket: {
          clients: 1,
        },
      });
    });

    socket.close();
  });

  it('rejects connections when connection rate limit is exceeded', async () => {
    // Fill up the rate limit (10 connections per IP per minute)
    const sockets: WebSocket[] = [];
    for (let i = 0; i < 10; i++) {
      sockets.push(await openSocket(address));
    }

    // 11th connection should be rejected
    const rejected = new WebSocket(address);
    const closeResult = await waitForClose(rejected);

    expect(closeResult.code).toBeGreaterThanOrEqual(1000);
    expect(closeResult.reason).toMatch(/too many connections/i);

    for (const s of sockets) {
      s.close();
    }
  });

  it('closes connection when message rate limit is exceeded', async () => {
    const socket = await openSocket(address);
    const closePromise = waitForClose(socket);

    // Send 101 messages rapidly (limit is 100/min)
    for (let i = 0; i < 101; i++) {
      if (socket.readyState !== WebSocket.OPEN) break;
      socket.send(JSON.stringify({ type: 'ping', n: i }));
    }

    const closeResult = await closePromise;

    expect(closeResult.code).toBeGreaterThanOrEqual(1000);
    expect(closeResult.reason).toMatch(/rate limit/i);
  });
});
