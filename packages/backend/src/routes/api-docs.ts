import type { FastifyInstance } from 'fastify';

const API_ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/events',
    auth: 'API key required',
    description: 'List delivered events with filters for search, severity, classification, ticker, and pagination.',
    queryParams: ['q', 'severity', 'classification', 'source', 'ticker', 'limit', 'offset'],
  },
  {
    method: 'GET',
    path: '/api/events/:id',
    auth: 'API key required',
    description: 'Fetch full event detail, provenance, audit context, and market data for a single event.',
    queryParams: [],
  },
  {
    method: 'GET',
    path: '/api/events/search',
    auth: 'API key required',
    description: 'Full-text search across event title, summary, ticker metadata, and company names.',
    queryParams: ['q', 'limit'],
  },
  {
    method: 'GET',
    path: '/api/stats',
    auth: 'API key required',
    description: 'Return aggregate event counts grouped by source and severity.',
    queryParams: [],
  },
  {
    method: 'GET',
    path: '/api/health',
    auth: 'No auth required',
    description: 'Public health check for uptime monitoring and deploy probes.',
    queryParams: [],
  },
  {
    method: 'GET',
    path: '/api/price/batch',
    auth: 'API key required',
    description: 'Fetch a latest-price snapshot for one or more tickers.',
    queryParams: ['tickers'],
  },
] as const;

export function registerApiDocsRoutes(server: FastifyInstance): void {
  server.get('/api-docs', async (_request, reply) => {
    return reply.send({
      name: 'Event Radar API',
      version: '1.0',
      authentication: {
        header: 'x-api-key',
        description: 'Pass your API key via the x-api-key header or apiKey query parameter.',
      },
      endpoints: API_ENDPOINTS,
    });
  });
}
