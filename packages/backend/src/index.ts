import { buildApp } from './app.js';
import { createDb } from './db/connection.js';

const databaseUrl = process.env.DATABASE_URL;
const dbCtx = databaseUrl ? createDb(databaseUrl) : undefined;

const apiKey = process.env.API_KEY;

const { server, registry } = buildApp({
  db: dbCtx?.db,
  apiKey,
});

const start = async () => {
  registry.startAll();

  const port = Number(process.env.PORT) || 3001;
  await server.listen({ port, host: '0.0.0.0' });

  console.log('='.repeat(60));
  console.log('Event Radar Backend v0.0.1');
  console.log(`Scanners: ${registry.healthAll().length} registered`);
  console.log(`Database: ${databaseUrl ? 'connected' : 'not configured'}`);
  console.log(`Port: ${port}`);
  console.log('='.repeat(60));

  const shutdown = async () => {
    registry.stopAll();
    await server.close();
    await dbCtx?.pool.end();
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
};

start();
