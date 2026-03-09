import Fastify from 'fastify';

const server = Fastify({ logger: true });

server.get('/health', async () => {
  return { status: 'ok' };
});

const start = async () => {
  const port = Number(process.env.PORT) || 3001;
  await server.listen({ port, host: '0.0.0.0' });
};

start();
