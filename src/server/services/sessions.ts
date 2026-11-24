import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { sessions, users } from "../db/schema.js";
import { generateSessionToken, hashSessionToken } from "../security/session-tokens.js";

/** Interval after which an unused session refreshes its last_seen_at. */
const TOUCH_INTERVAL_MS = 15 * 60 * 1000;

export interface SessionContext {
  userId: string;
  tokenHash: Buffer;
  createdAt: Date;
  expiresAt: Date;
  lastSeenAt: Date;
}

export interface CreateSessionInput {
  userId: string;
  ttlDays: number;
  ip: string | null;
  userAgent: string | null;
}

/**
 * Creates a session row and returns the raw token. The raw token is sent to the
 * browser once; only its SHA-256 hash is stored.
 */
export async function createSession(db: DbExecutor, input: CreateSessionInput): Promise<string> {
  const token = generateSessionToken();
  await db.insert(sessions).values({
    tokenHash: hashSessionToken(token),
    userId: input.userId,
    expiresAt: new Date(Date.now() + input.ttlDays * 24 * 60 * 60 * 1000),
    ip: input.ip,
    userAgent: input.userAgent,
  });
  return token;
}

/**
 * Resolves a raw token to a live session. A session is live when it is not revoked,
 * not past its absolute expiry, not idle for longer than `idleDays`, and its user is active.
 */
export async function resolveSession(
  db: DbExecutor,
  token: string,
  idleDays: number,
): Promise<SessionContext | null> {
  const tokenHash = hashSessionToken(token);
  const idleCutoff = new Date(Date.now() - idleDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      userId: sessions.userId,
      tokenHash: sessions.tokenHash,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, sql`now()`),
        gt(sessions.lastSeenAt, idleCutoff),
        eq(users.status, "active"),
      ),
    )
    .limit(1);

  const session = rows[0];
  if (!session) return null;

  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.tokenHash, tokenHash));
  }

  return session;
}

/** Revokes one session by the hash of its token. */
export async function revokeSessionByHash(db: DbExecutor, tokenHash: Buffer): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)));
}

/** Revokes every live session of a user, except optionally one. */
export async function revokeAllSessions(
  db: DbExecutor,
  userId: string,
  exceptTokenHash?: Buffer,
): Promise<number> {
  const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
  if (exceptTokenHash) {
    conditions.push(sql`${sessions.tokenHash} <> ${exceptTokenHash}`);
  }
  const rows = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(...conditions))
    .returning({ tokenHash: sessions.tokenHash });
  return rows.length;
}

export interface SessionListItem {
  tokenHash: Buffer;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  ip: string | null;
  userAgent: string | null;
}

/** Live sessions of a user, most recently used first. */
export async function listSessions(db: DbExecutor, userId: string): Promise<SessionListItem[]> {
  return db
    .select({
      tokenHash: sessions.tokenHash,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      ip: sessions.ip,
      userAgent: sessions.userAgent,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, sql`now()`),
      ),
    )
    .orderBy(desc(sessions.lastSeenAt));
}

/** Revokes a session that belongs to the given user. Returns false if it is not theirs. */
export async function revokeOwnSession(
  db: DbExecutor,
  userId: string,
  tokenHash: Buffer,
): Promise<boolean> {
  const rows = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.userId, userId),
        eq(sessions.tokenHash, tokenHash),
        isNull(sessions.revokedAt),
      ),
    )
    .returning({ tokenHash: sessions.tokenHash });
  return rows.length > 0;
}
