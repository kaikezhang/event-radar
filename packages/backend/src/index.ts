import { buildApp } from './app.js';

const { server, registry } = buildApp();

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
