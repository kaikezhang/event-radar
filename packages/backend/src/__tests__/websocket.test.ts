import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp, type AppContext } from '../app.js';
import { safeCloseServer } from './helpers/test-db.js';

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

async function openSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('socket connection failed')), {
      once: true,
    });
  });

  return socket;
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
  let address: string;

  beforeAll(async () => {
    ctx = buildApp({ logger: false, apiKey: TEST_API_KEY });
    await ctx.server.listen({ port: 0, host: '127.0.0.1' });

    const serverAddress = ctx.server.server.address();
    if (!serverAddress || typeof serverAddress === 'string') {
      throw new Error('expected TCP server address');
    }

    address = `ws://127.0.0.1:${serverAddress.port}/ws/events?apiKey=${TEST_API_KEY}`;
  });

  afterAll(async () => {
    await safeCloseServer(ctx.server);
  });

  it('accepts authenticated websocket connections', async () => {
    const socket = await openSocket(address);

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
    const socket = new WebSocket('ws://127.0.0.1:' + new URL(address).port + '/ws/events?apiKey=wrong-key');

    const closeResult = await new Promise<{ code: number; reason: string }>((resolve) => {
      socket.addEventListener(
        'close',
        (event) => {
          resolve({ code: event.code, reason: event.reason });
        },
        { once: true },
      );
    });

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
});
