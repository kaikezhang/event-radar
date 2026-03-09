import Fastify from 'fastify';
import { InMemoryEventBus, ScannerRegistry } from '@event-radar/shared';
import { DummyScanner } from './scanners/dummy-scanner.js';

const server = Fastify({ logger: true });
const eventBus = new InMemoryEventBus();
const registry = new ScannerRegistry();

registry.register(new DummyScanner(eventBus));

server.get('/health', async () => {
  return {
    status: 'ok',
    scanners: registry.healthAll(),
  };
});

const start = async () => {
  registry.startAll();

  const port = Number(process.env.PORT) || 3001;
  await server.listen({ port, host: '0.0.0.0' });

  const shutdown = async () => {
    registry.stopAll();
    await server.close();
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
};

start();
