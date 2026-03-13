import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../db/connection.js';
import { asRecord, parseConfidence } from './route-utils.js';

interface JudgeRow {
  audit_id: number;
  audit_created_at: string;
  audit_event_id: string;
  audit_source: string;
  audit_title: string;
  audit_severity: string | null;
  audit_ticker: string | null;
  audit_outcome: string;
  audit_stopped_at: string;
  audit_reason: string | null;
  event_id: string | null;
  event_source: string | null;
  event_title: string | null;
  event_severity: string | null;
  event_metadata: unknown;
}

type JudgeDecision = 'PASS' | 'BLOCK';

const RecentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const StatsQuerySchema = z.object({
  since: z.enum(['1h', '24h', '7d']).optional(),
});

function asJudgeDecision(value: unknown): JudgeDecision | null {
  return value === 'PASS' || value === 'BLOCK' ? value : null;
}

function parseReasonFromAudit(auditReason: string | null): string | null {
  if (!auditReason) {
    return null;
  }

  const match = /^LLM:\s*(.+?)\s*\(confidence:\s*[\d.]+\)$/i.exec(auditReason);
  return match?.[1]?.trim() ?? auditReason;
}

function parseConfidenceFromAudit(auditReason: string | null): number | null {
  if (!auditReason) {
    return null;
  }

  const match = /\(confidence:\s*([\d.]+)\)$/i.exec(auditReason);
  return match?.[1] ? Number(match[1]) : null;
}

function getJudgePayload(row: JudgeRow): {
  decision: JudgeDecision;
  confidence: number | null;
  reason: string | null;
} | null {
  const metadata = asRecord(row.event_metadata);
  const judge = asRecord(metadata['llm_judge']);
  const decision = asJudgeDecision(judge['decision'])
    ?? (row.audit_stopped_at === 'llm_judge' ? 'BLOCK' : row.audit_outcome === 'delivered' ? 'PASS' : null);

  if (!decision) {
    return null;
  }

  return {
    decision,
    confidence: parseConfidence(judge['confidence']) ?? parseConfidenceFromAudit(row.audit_reason),
    reason: (typeof judge['reason'] === 'string' && judge['reason'].trim().length > 0)
      ? judge['reason']
      : parseReasonFromAudit(row.audit_reason),
  };
}

function getSinceDate(window: '1h' | '24h' | '7d' | undefined): Date | null {
  if (!window) {
    return null;
  }

  const now = Date.now();
  if (window === '1h') {
    return new Date(now - 60 * 60 * 1000);
  }
  if (window === '24h') {
    return new Date(now - 24 * 60 * 60 * 1000);
  }

  return new Date(now - 7 * 24 * 60 * 60 * 1000);
}

async function queryJudgeRows(
  db: Database,
  options: {
    limit?: number;
    since?: '1h' | '24h' | '7d';
  } = {},
): Promise<JudgeRow[]> {
  const conditions: ReturnType<typeof sql>[] = [
    sql`(
      pa.stopped_at = 'llm_judge'
      OR (
        pa.outcome = 'delivered'
        AND COALESCE(e.metadata->'llm_judge'->>'decision', '') = 'PASS'
      )
    )`,
  ];

  const sinceDate = getSinceDate(options.since);
  if (sinceDate) {
    conditions.push(sql`pa.created_at >= ${sinceDate}`);
  }

  const whereClause = conditions.reduce((acc, condition) => sql`${acc} AND ${condition}`);
  const queryLimit = options.limit ?? (options.since ? undefined : 10_000);
  const limitClause = queryLimit != null ? sql`LIMIT ${queryLimit}` : sql``;
  const query = sql`
    SELECT
      pa.id AS audit_id,
      pa.created_at AS audit_created_at,
      pa.event_id AS audit_event_id,
      pa.source AS audit_source,
      pa.title AS audit_title,
      pa.severity AS audit_severity,
      pa.ticker AS audit_ticker,
      pa.outcome AS audit_outcome,
      pa.stopped_at AS audit_stopped_at,
      pa.reason AS audit_reason,
      pa.event_id AS event_id,
      e.source AS event_source,
      e.title AS event_title,
      e.severity AS event_severity,
      e.metadata AS event_metadata
    FROM pipeline_audit pa
    LEFT JOIN events e ON e.source_event_id = pa.event_id
    WHERE ${whereClause}
    ORDER BY pa.created_at DESC, pa.id DESC
    ${limitClause}
  `;

  const result = await db.execute(query);
  return (result as unknown as { rows: JudgeRow[] }).rows;
}

export function registerJudgeRoutes(server: FastifyInstance, db?: Database): void {
  server.get<{
    Querystring: {
      limit?: string;
    };
  }>('/api/v1/judge/recent', async (request, reply) => {
    if (!db) {
      return reply.code(503).send({ error: 'Database not configured' });
    }

    const parsedQuery = RecentQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: 'Invalid limit' });
    }

    const limit = parsedQuery.data.limit ?? 50;

    try {
      const rows = await queryJudgeRows(db, { limit });

      return reply.send({
        events: rows.flatMap((row) => {
          const payload = getJudgePayload(row);
          if (!payload) {
            return [];
          }

          return [{
            id: row.event_id ?? row.audit_event_id,
            title: row.event_title ?? row.audit_title,
            source: row.event_source ?? row.audit_source,
            severity: row.event_severity ?? row.audit_severity,
            decision: payload.decision,
            confidence: payload.confidence,
            reason: payload.reason,
            ticker: row.audit_ticker,
            at: new Date(row.audit_created_at).toISOString(),
          }];
        }),
      });
    } catch (err) {
      server.log.error({ err, msg: 'judge recent query failed' });
      return reply.code(500).send({ error: 'Judge recent query failed' });
    }
  });

  server.get<{
    Querystring: {
      since?: string;
    };
  }>('/api/v1/judge/stats', async (request, reply) => {
    if (!db) {
      return reply.code(503).send({ error: 'Database not configured' });
    }

    const parsedQuery = StatsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.code(400).send({ error: 'Invalid since window' });
    }

    try {
      const rows = await queryJudgeRows(db, { since: parsedQuery.data.since });
      const bySource: Record<string, { passed: number; blocked: number }> = {};
      const total = { passed: 0, blocked: 0 };

      for (const row of rows) {
        const payload = getJudgePayload(row);
        if (!payload) {
          continue;
        }

        const source = row.event_source ?? row.audit_source;
        bySource[source] ??= { passed: 0, blocked: 0 };

        if (payload.decision === 'PASS') {
          bySource[source].passed += 1;
          total.passed += 1;
        } else {
          bySource[source].blocked += 1;
          total.blocked += 1;
        }
      }

      return reply.send({ bySource, total });
    } catch (err) {
      server.log.error({ err, msg: 'judge stats query failed' });
      return reply.code(500).send({ error: 'Judge stats query failed' });
    }
  });
}
