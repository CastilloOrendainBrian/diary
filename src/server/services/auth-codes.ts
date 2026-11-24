import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { AppConfig } from "../config.js";
import type { Database } from "../db/client.js";
import { loginCodes, users } from "../db/schema.js";
import type { MailService } from "../mail/mailer.js";
import {
  defaultDisplayName,
  emailDomain,
  isValidTimezone,
  normalizeEmail,
} from "../security/email.js";
import { generateLoginCode, hashLoginCode, verifyLoginCode } from "../security/login-codes.js";
import { recordAudit } from "./audit.js";
import { createSession } from "./sessions.js";
import {
  cancelDeletion,
  createUser,
  findUserByEmail,
  getPermissionCodes,
  type UserRecord,
} from "./users.js";

const RATE_WINDOW_MINUTES = 15;
const CODE_PATTERN = /^\d{6}$/;

export type VerifyResult =
  | {
      ok: true;
      user: UserRecord;
      permissions: string[];
      sessionToken: string;
      /** True when this verification created the account. */
      registered: boolean;
    }
  | { ok: false; reason: "invalid_code" | "account_disabled" | "registration_closed" };

export interface RequestCodeInput {
  email: string;
  ip: string | null;
}

export interface VerifyCodeInput {
  email: string;
  code: string;
  ip: string | null;
  userAgent: string | null;
  displayName?: string | undefined;
  timezone?: string | undefined;
}

export interface AuthCodeServiceDeps {
  db: Database;
  mailer: MailService;
  config: AppConfig;
}

/**
 * Passwordless authentication by one-time email code.
 *
 * Responses never reveal whether an address has an account: `requestCode` always
 * returns the same result, and the email is sent in the background so timing does
 * not reveal it either.
 */
export class AuthCodeService {
  /** In-flight email deliveries. Tests await these; production ignores them. */
  private readonly pendingDeliveries = new Set<Promise<void>>();

  constructor(private readonly deps: AuthCodeServiceDeps) {}

  /** Starts a sign-in or sign-up. Never throws for user-facing reasons. */
  async requestCode(input: RequestCodeInput): Promise<void> {
    const { db, config } = this.deps;
    const email = normalizeEmail(input.email);
    if (!email) return;

    const recent = await db
      .select({ id: loginCodes.id })
      .from(loginCodes)
      .where(
        and(
          eq(loginCodes.email, email),
          gt(loginCodes.createdAt, sql`now() - make_interval(mins => ${RATE_WINDOW_MINUTES})`),
        ),
      );
    if (recent.length >= config.CODE_REQUESTS_PER_15_MIN) {
      await recordAudit(db, {
        action: "auth.code.rate_limited",
        ip: input.ip,
        metadata: { emailDomain: emailDomain(email) },
      });
      return;
    }

    const user = await findUserByEmail(db, email);
    if (user && user.status !== "active") {
      await recordAudit(db, {
        action: "auth.code.refused",
        actorId: user.id,
        ip: input.ip,
        metadata: { reason: "account_disabled" },
      });
      return;
    }
    if (!user && !this.isRegistrationAllowed(email)) {
      await recordAudit(db, {
        action: "auth.code.refused",
        ip: input.ip,
        metadata: { reason: "registration_closed" },
      });
      return;
    }

    const code = generateLoginCode();
    const [row] = await db
      .insert(loginCodes)
      .values({
        email,
        codeHash: hashLoginCode(config.CODE_HMAC_SECRET, email, code),
        expiresAt: new Date(Date.now() + config.CODE_TTL_MINUTES * 60 * 1000),
        ip: input.ip,
      })
      .returning({ id: loginCodes.id });
    if (!row) throw new Error("login code insert returned no row");

    this.track(this.deliver(email, code, row.id, input.ip));
  }

  /** Checks a code. Creates the account on first successful use when registration is open. */
  async verifyCode(input: VerifyCodeInput): Promise<VerifyResult> {
    const { db, config } = this.deps;
    const email = normalizeEmail(input.email);
    if (!email || !CODE_PATTERN.test(input.code)) {
      return { ok: false, reason: "invalid_code" };
    }

    const [active] = await db
      .select()
      .from(loginCodes)
      .where(
        and(
          eq(loginCodes.email, email),
          isNull(loginCodes.consumedAt),
          gt(loginCodes.expiresAt, sql`now()`),
        ),
      )
      .orderBy(desc(loginCodes.createdAt))
      .limit(1);

    if (!active) {
      await recordAudit(db, {
        action: "auth.code.invalid",
        ip: input.ip,
        metadata: { reason: "no_active_code" },
      });
      return { ok: false, reason: "invalid_code" };
    }

    if (!verifyLoginCode(config.CODE_HMAC_SECRET, email, input.code, active.codeHash)) {
      // Count the failure; the code is burned once the attempt limit is reached.
      const attempts = active.attempts + 1;
      await db
        .update(loginCodes)
        .set({
          attempts,
          consumedAt: attempts >= config.CODE_MAX_ATTEMPTS ? new Date() : null,
        })
        .where(eq(loginCodes.id, active.id));
      await recordAudit(db, {
        action: "auth.code.invalid",
        ip: input.ip,
        metadata: { reason: "wrong_code", attempts },
      });
      return { ok: false, reason: "invalid_code" };
    }

    return db.transaction(async (tx) => {
      // Consume the code atomically. If a concurrent request already used it, reject.
      const consumed = await tx
        .update(loginCodes)
        .set({ consumedAt: new Date() })
        .where(and(eq(loginCodes.id, active.id), isNull(loginCodes.consumedAt)))
        .returning({ id: loginCodes.id });
      if (consumed.length === 0) {
        return { ok: false as const, reason: "invalid_code" as const };
      }

      let user = await findUserByEmail(tx, email);
      let registered = false;

      if (user && user.status !== "active") {
        await recordAudit(tx, {
          action: "auth.login.refused",
          actorId: user.id,
          ip: input.ip,
          metadata: { reason: "account_disabled" },
        });
        return { ok: false as const, reason: "account_disabled" as const };
      }

      if (!user) {
        if (!this.isRegistrationAllowed(email)) {
          await recordAudit(tx, {
            action: "auth.register.refused",
            ip: input.ip,
            metadata: { reason: "registration_closed" },
          });
          return { ok: false as const, reason: "registration_closed" as const };
        }
        user = await createUser(tx, {
          email,
          displayName: input.displayName ?? defaultDisplayName(email),
          timezone: this.pickTimezone(input.timezone),
          roleNames: ["user"],
        });
        registered = true;
        await recordAudit(tx, {
          action: "auth.register",
          actorId: user.id,
          targetType: "user",
          targetId: user.id,
          ip: input.ip,
        });
      }

      // The browser timezone is applied only while the account still has the default value,
      // so a timezone the user chose in their profile is never overwritten.
      const detectedTimezone =
        user.timezone === "UTC" && input.timezone && isValidTimezone(input.timezone)
          ? input.timezone
          : undefined;

      if (user.deletionRequestedAt) {
        await cancelDeletion(tx, user.id);
        await recordAudit(tx, {
          action: "account.deletion.cancelled",
          actorId: user.id,
          ip: input.ip,
        });
      }

      await tx
        .update(users)
        .set({
          lastLoginAt: new Date(),
          updatedAt: new Date(),
          ...(detectedTimezone ? { timezone: detectedTimezone } : {}),
        })
        .where(eq(users.id, user.id));

      const sessionToken = await createSession(tx, {
        userId: user.id,
        ttlDays: config.SESSION_TTL_DAYS,
        ip: input.ip,
        userAgent: input.userAgent,
      });
      await recordAudit(tx, { action: "auth.login.success", actorId: user.id, ip: input.ip });

      const permissions = await getPermissionCodes(tx, user.id);
      return { ok: true as const, user, permissions, sessionToken, registered };
    });
  }

  /** Waits for background deliveries to finish (used by tests and graceful shutdown). */
  async waitForDeliveries(): Promise<void> {
    await Promise.allSettled([...this.pendingDeliveries]);
  }

  private isRegistrationAllowed(email: string): boolean {
    const { REGISTRATION_ENABLED, ALLOWED_EMAIL_DOMAINS } = this.deps.config;
    if (!REGISTRATION_ENABLED) return false;
    if (ALLOWED_EMAIL_DOMAINS.length === 0) return true;
    return ALLOWED_EMAIL_DOMAINS.includes(emailDomain(email));
  }

  private pickTimezone(timezone: string | undefined): string {
    return timezone && isValidTimezone(timezone) ? timezone : "UTC";
  }

  private track(promise: Promise<void>): void {
    this.pendingDeliveries.add(promise);
    void promise.finally(() => this.pendingDeliveries.delete(promise));
  }

  private async deliver(
    email: string,
    code: string,
    codeId: string,
    ip: string | null,
  ): Promise<void> {
    const { db, mailer, config } = this.deps;
    try {
      const result = await mailer.sendLoginCode({
        to: email,
        code,
        ttlMinutes: config.CODE_TTL_MINUTES,
        idempotencyKey: codeId,
      });
      await recordAudit(db, {
        action: "auth.code.sent",
        ip,
        targetType: "login_code",
        targetId: codeId,
        metadata: { providerId: result.providerId },
      });
    } catch (error) {
      // The user already received the generic response; log the failure without the code.
      await recordAudit(db, {
        action: "auth.code.send_failed",
        ip,
        targetType: "login_code",
        targetId: codeId,
        metadata: { error: error instanceof Error ? error.message : "unknown" },
      });
    }
  }
}
