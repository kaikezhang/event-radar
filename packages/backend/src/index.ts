import { buildApp } from './app.js';
import { createDb } from './db/connection.js';

const databaseUrl = process.env.DATABASE_URL;
const dbCtx = databaseUrl ? createDb(databaseUrl) : undefined;

const { server, registry } = buildApp({
  db: dbCtx?.db,
});

const start = async () => {
  registry.startAll();

  const port = Number(process.env.PORT) || 3001;
  await server.listen({ port, host: '0.0.0.0' });

  const shutdown = async () => {
    registry.stopAll();
    await server.close();
    await dbCtx?.pool.end();
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
};

start();
