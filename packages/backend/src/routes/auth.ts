import { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { randomBytes, createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { eq, and, isNull, gt, sql } from 'drizzle-orm';
import type { Database } from '../db/connection.js';
import * as schema from '../db/schema.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function randomToken(): string {
  return randomBytes(32).toString('hex'); // 64 hex chars
}

// Per-boot random secret for AUTH_REQUIRED=false (single-user self-hosted)
let _bootSecret: string | undefined;
function getBootSecret(): string {
  if (!_bootSecret) {
    _bootSecret = randomBytes(32).toString('hex');
  }
  return _bootSecret;
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (secret) return new TextEncoder().encode(secret);

  const authRequired = process.env.AUTH_REQUIRED === 'true';
  if (authRequired) {
    throw new Error('JWT_SECRET must be set when AUTH_REQUIRED=true');
  }

  // AUTH_REQUIRED=false: random per-boot secret (acceptable for single-user self-hosted)
  return new TextEncoder().encode(getBootSecret());
}

/**
 * Validate JWT configuration at startup.
 * Call this during server init to fail fast if misconfigured.
 */
export function validateJwtConfig(): void {
  if (process.env.AUTH_REQUIRED === 'true' && !process.env.JWT_SECRET) {
    throw new Error(
      'FATAL: JWT_SECRET environment variable is required when AUTH_REQUIRED=true. ' +
      'Set a strong random secret (e.g. openssl rand -hex 32) before starting the server.',
    );
  }
}

const ACCESS_TOKEN_EXPIRY = '7d';
const REFRESH_TOKEN_DAYS = 30;
const MAGIC_LINK_MINUTES = 15;

async function signAccessToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ sub: userId, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(getJwtSecret());
}

export async function verifyAccessToken(token: string): Promise<{ sub: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return { sub: payload.sub as string, email: payload.email as string };
  } catch {
    return null;
  }
}

function setCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string,
  csrfToken: string,
): void {
  const secure = process.env.NODE_ENV === 'production';
  const sameSite = 'Strict';

  reply.header('Set-Cookie', [
    `er_access=${accessToken}; HttpOnly; Path=/; Max-Age=${7 * 86400}; SameSite=${sameSite}${secure ? '; Secure' : ''}`,
    `er_refresh=${refreshToken}; HttpOnly; Path=/api/auth; Max-Age=${30 * 86400}; SameSite=${sameSite}${secure ? '; Secure' : ''}`,
    `er_csrf=${csrfToken}; Path=/; Max-Age=${30 * 86400}; SameSite=${sameSite}${secure ? '; Secure' : ''}`,
  ]);
}

function clearCookies(reply: FastifyReply): void {
  const secure = process.env.NODE_ENV === 'production';
  reply.header('Set-Cookie', [
    `er_access=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${secure ? '; Secure' : ''}`,
    `er_refresh=; HttpOnly; Path=/api/auth; Max-Age=0; SameSite=Strict${secure ? '; Secure' : ''}`,
    `er_csrf=; Path=/; Max-Age=0; SameSite=Strict${secure ? '; Secure' : ''}`,
  ]);
}

function parseCookies(request: FastifyRequest): Record<string, string> {
  const header = request.headers.cookie;
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    cookies[key] = val;
  }
  return cookies;
}

// Rate limiter — in-memory per email
const magicLinkRateLimit = new Map<string, number[]>();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(email: string): boolean {
  const now = Date.now();
  const timestamps = (magicLinkRateLimit.get(email) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  magicLinkRateLimit.set(email, timestamps);
  return true;
}

// ── send email ───────────────────────────────────────────────────────────────

async function sendMagicLinkEmail(email: string, token: string): Promise<void> {
  const appUrl = process.env.APP_URL ?? 'http://localhost:5173';
  const link = `${appUrl}/auth/verify?token=${token}`;

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' || process.env.AUTH_DEV_LOG === 'true';
    if (isDev) {
      console.log(`[auth] Magic link for ${email}: ${link}`);
    } else {
      console.log(`[auth] Magic link generated for ${email} (set NODE_ENV=development or AUTH_DEV_LOG=true to see URL)`);
    }
    return;
  }

  const { Resend } = await import('resend');
  const resend = new Resend(resendKey);
  const from = process.env.MAIL_FROM ?? 'noreply@event-radar.dev';

  await resend.emails.send({
    from,
    to: email,
    subject: 'Your Event Radar login link',
    html: `<p>Click <a href="${link}">here</a> to sign in to Event Radar. This link expires in 15 minutes.</p>`,
  });
}

// ── route registration ───────────────────────────────────────────────────────

export function registerAuthRoutes(
  server: FastifyInstance,
  db: Database,
): void {
  // POST /api/auth/magic-link
  server.post('/api/auth/magic-link', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { email?: string } | null;
    const email = body?.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.status(400).send({ error: 'Invalid email' });
    }

    if (!checkRateLimit(email)) {
      return reply.status(429).send({ error: 'Too many requests. Try again later.' });
    }

    const token = randomToken();
    const tokenHash = sha256(token);
    const expiresAt = new Date(Date.now() + MAGIC_LINK_MINUTES * 60 * 1000);

    await db.insert(schema.magicLinkTokens).values({
      email,
      tokenHash,
      expiresAt,
    });

    await sendMagicLinkEmail(email, token);

    return reply.send({ ok: true, message: 'Check your email' });
  });

  // POST /api/auth/verify
  server.post('/api/auth/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { token?: string } | null;
    const token = body?.token;
    if (!token) {
      return reply.status(400).send({ error: 'Missing token' });
    }

    const tokenHash = sha256(token);

    // Atomic verify: mark as used only if still valid
    const result = await db
      .update(schema.magicLinkTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(schema.magicLinkTokens.tokenHash, tokenHash),
          isNull(schema.magicLinkTokens.usedAt),
          gt(schema.magicLinkTokens.expiresAt, new Date()),
        ),
      )
      .returning();

    if (result.length === 0) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }

    const email = result[0]!.email;
    const userId = email; // use email as user ID

    // Create user if not exists
    await db
      .insert(schema.users)
      .values({ id: userId, email })
      .onConflictDoNothing();

    // Generate tokens
    const accessToken = await signAccessToken(userId, email);
    const refreshTokenPlain = randomToken();
    const refreshTokenHash = sha256(refreshTokenPlain);
    const csrfToken = randomToken();
    const familyId = crypto.randomUUID();

    await db.insert(schema.refreshTokens).values({
      userId,
      tokenHash: refreshTokenHash,
      familyId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
    });

    setCookies(reply, accessToken, refreshTokenPlain, csrfToken);

    return reply.send({
      ok: true,
      user: { id: userId, email, displayName: null },
    });
  });

  // POST /api/auth/refresh
  server.post('/api/auth/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const cookies = parseCookies(request);
    const refreshTokenPlain = cookies['er_refresh'];
    if (!refreshTokenPlain) {
      return reply.status(401).send({ error: 'No refresh token' });
    }

    const tokenHash = sha256(refreshTokenPlain);

    // Atomic refresh rotation in a single transaction
    const result = await db.transaction(async (tx) => {
      // SELECT FOR UPDATE to lock the token row and prevent concurrent rotation
      const rows = await tx.execute(
        sql`SELECT * FROM refresh_tokens WHERE token_hash = ${tokenHash} LIMIT 1 FOR UPDATE`,
      );

      if (rows.rows.length === 0) {
        return { error: 'Invalid refresh token' } as const;
      }

      const tokenRow = rows.rows[0] as {
        id: string; user_id: string; token_hash: string;
        family_id: string; replaced_by: string | null;
        expires_at: Date; revoked_at: Date | null;
      };

      // If revoked → revoke entire family (replay attack) in same transaction
      if (tokenRow.revoked_at) {
        await tx
          .update(schema.refreshTokens)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(schema.refreshTokens.familyId, tokenRow.family_id),
              isNull(schema.refreshTokens.revokedAt),
            ),
          );
        return { error: 'Token reuse detected' } as const;
      }

      // If expired
      if (new Date() > new Date(tokenRow.expires_at)) {
        return { error: 'Refresh token expired' } as const;
      }

      // Rotate: insert new token, revoke old — all in one transaction
      const newRefreshPlain = randomToken();
      const newRefreshHash = sha256(newRefreshPlain);

      const [newRow] = await tx
        .insert(schema.refreshTokens)
        .values({
          userId: tokenRow.user_id,
          tokenHash: newRefreshHash,
          familyId: tokenRow.family_id,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
        })
        .returning();

      await tx
        .update(schema.refreshTokens)
        .set({ revokedAt: new Date(), replacedBy: newRow!.id })
        .where(eq(schema.refreshTokens.id, tokenRow.id));

      // Get user email for JWT
      const userRows = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, tokenRow.user_id))
        .limit(1);
      const userEmail = userRows[0]?.email ?? tokenRow.user_id;

      return {
        ok: true,
        userId: tokenRow.user_id,
        userEmail,
        newRefreshPlain,
      } as const;
    });

    if ('error' in result) {
      if (result.error === 'Token reuse detected') {
        clearCookies(reply);
      }
      return reply.status(401).send({ error: result.error });
    }

    const accessToken = await signAccessToken(result.userId, result.userEmail);
    const csrfToken = randomToken();

    setCookies(reply, accessToken, result.newRefreshPlain, csrfToken);

    return reply.send({ ok: true });
  });

  // POST /api/auth/logout
  server.post('/api/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const cookies = parseCookies(request);
    const refreshTokenPlain = cookies['er_refresh'];

    if (refreshTokenPlain) {
      const tokenHash = sha256(refreshTokenPlain);
      await db
        .update(schema.refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(schema.refreshTokens.tokenHash, tokenHash));
    }

    clearCookies(reply);
    return reply.send({ ok: true });
  });

  // GET /api/auth/me
  server.get('/api/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const cookies = parseCookies(request);
    const accessToken = cookies['er_access'];

    if (!accessToken) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const payload = await verifyAccessToken(accessToken);
    if (!payload) {
      return reply.status(401).send({ error: 'Invalid token' });
    }

    const userRows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, payload.sub))
      .limit(1);

    if (userRows.length === 0) {
      return reply.status(401).send({ error: 'User not found' });
    }

    const user = userRows[0]!;
    return reply.send({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    });
  });
}

export { parseCookies };
