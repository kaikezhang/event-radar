import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { tickerReference, events } from '../db/schema.js';
import type { Database } from '../db/connection.js';

export function registerTickerRoutes(
  server: FastifyInstance,
  db: Database,
): void {
  /**
   * GET /api/tickers/search?q=NVI&limit=8
   * Search tickers by symbol prefix or company name (contains).
   * Ticker prefix matches rank higher than name matches.
   */
  server.get('/api/tickers/search', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 8 },
        },
        required: ['q'],
      },
    },
  }, async (request) => {
    const { q, limit = 8 } = request.query as { q: string; limit?: number };
    const query = q.trim();

    if (!query) {
      return { data: [] };
    }

    const safeLimit = Math.min(Math.max(limit, 1), 20);
    const upperQuery = query.toUpperCase();
    const lowerQuery = query.toLowerCase();

    // Search by ticker prefix (case-insensitive) and name contains (case-insensitive)
    // Rank: exact ticker match first, then ticker prefix, then name contains
    const results = await db.execute(sql`
      SELECT
        ticker,
        name,
        sector,
        exchange,
        CASE
          WHEN UPPER(ticker) = ${upperQuery} THEN 0
          WHEN UPPER(ticker) LIKE ${upperQuery + '%'} THEN 1
          ELSE 2
        END AS rank
      FROM ticker_reference
      WHERE UPPER(ticker) LIKE ${upperQuery + '%'}
         OR LOWER(name) LIKE ${'%' + lowerQuery + '%'}
      ORDER BY rank, LENGTH(ticker), ticker
      LIMIT ${safeLimit}
    `);

    return {
      data: results.rows.map((row: Record<string, unknown>) => ({
        ticker: row.ticker,
        name: row.name,
        sector: row.sector ?? null,
        exchange: row.exchange ?? null,
      })),
    };
  });

  /**
   * GET /api/tickers/trending?limit=8
   * Return tickers with highest event count in last 24h.
   */
  server.get('/api/tickers/trending', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 8 },
        },
      },
    },
  }, async (request) => {
    const { limit = 8 } = request.query as { limit?: number };
    const safeLimit = Math.min(Math.max(limit, 1), 20);

    const results = await db.execute(sql`
      SELECT
        e.ticker,
        COUNT(*)::int AS event_count,
        tr.name,
        tr.sector
      FROM events e
      LEFT JOIN ticker_reference tr ON tr.ticker = e.ticker
      WHERE e.ticker IS NOT NULL
        AND e.created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY e.ticker, tr.name, tr.sector
      ORDER BY event_count DESC
      LIMIT ${safeLimit}
    `);

    return {
      data: results.rows.map((row: Record<string, unknown>) => ({
        ticker: row.ticker,
        eventCount: Number(row.event_count),
        name: row.name ?? null,
        sector: row.sector ?? null,
      })),
    };
  });
}
