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

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[shutdown] Received ${signal}, shutting down gracefully...`);

    try {
      console.log('[shutdown] Stopping scanners...');
      registry.stopAll();

      console.log('[shutdown] Closing HTTP server...');
      await server.close();

      if (dbCtx?.pool) {
        console.log('[shutdown] Closing database connection...');
        await dbCtx.pool.end();
      }

      console.log('[shutdown] Clean shutdown complete.');
      process.exit(0);
    } catch (err) {
      console.error('[shutdown] Error during shutdown:', err);
      process.exit(1);
    }
  };

  // Force exit after 10 seconds if graceful shutdown hangs
  const forceExit = (signal: string) => {
    setTimeout(() => {
      console.error(`[shutdown] Forced exit after 10s timeout (${signal})`);
      process.exit(1);
    }, 10_000).unref();
    void shutdown(signal);
  };

  process.on('SIGTERM', () => forceExit('SIGTERM'));
  process.on('SIGINT', () => forceExit('SIGINT'));
};

start();
