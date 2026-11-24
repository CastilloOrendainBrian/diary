import type { FastifyInstance } from "fastify";
import { requestCodeSchema, verifyCodeSchema } from "../../shared/auth.js";
import type { AppConfig } from "../config.js";
import type { Database } from "../db/client.js";
import { errors } from "../errors.js";
import { requireAuth, SESSION_COOKIE } from "../plugins/auth-context.js";
import { recordAudit } from "../services/audit.js";
import type { AuthCodeService } from "../services/auth-codes.js";
import { revokeSessionByHash } from "../services/sessions.js";
import { findUserById } from "../services/users.js";

export interface AuthRoutesDeps {
  db: Database;
  config: AppConfig;
  authCodes: AuthCodeService;
}

const SECONDS_PER_DAY = 24 * 60 * 60;

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps): void {
  const { db, config, authCodes } = deps;
  const rateLimit = { max: config.AUTH_RATE_LIMIT_PER_MINUTE, timeWindow: "1 minute" };
  const cookieOptions = {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: config.NODE_ENV === "production",
    path: "/",
  };

  // Always 202, whether or not the address belongs to an account.
  app.post("/api/auth/code", { config: { rateLimit } }, async (request, reply) => {
    const body = requestCodeSchema.safeParse(request.body);
    if (!body.success) {
      throw errors.validation("A valid email address is required");
    }

    await authCodes.requestCode({ email: body.data.email, ip: request.ip });
    return reply.code(202).send({ status: "accepted" });
  });

  app.post("/api/auth/code/verify", { config: { rateLimit } }, async (request, reply) => {
    const body = verifyCodeSchema.safeParse(request.body);
    if (!body.success) {
      throw errors.validation("Email and a 6-digit code are required");
    }

    const result = await authCodes.verifyCode({
      email: body.data.email,
      code: body.data.code,
      displayName: body.data.displayName,
      timezone: body.data.timezone,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    if (!result.ok) {
      switch (result.reason) {
        case "invalid_code":
          throw errors.invalidCode();
        case "account_disabled":
          throw errors.accountDisabled();
        case "registration_closed":
          throw errors.registrationClosed();
      }
    }

    reply.setCookie(SESSION_COOKIE, result.sessionToken, {
      ...cookieOptions,
      maxAge: config.SESSION_TTL_DAYS * SECONDS_PER_DAY,
    });

    return reply.send({
      user: toPublicUser(result.user),
      permissions: result.permissions,
      registered: result.registered,
    });
  });

  app.post("/api/auth/logout", { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth;
    if (!auth) throw errors.unauthenticated();

    await revokeSessionByHash(db, auth.tokenHash);
    await recordAudit(db, { action: "auth.logout", actorId: auth.userId, ip: request.ip });

    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/api/auth/me", { preHandler: requireAuth }, async (request) => {
    const auth = request.auth;
    if (!auth) throw errors.unauthenticated();

    const user = await findUserById(db, auth.userId);
    if (!user) throw errors.unauthenticated();

    return { user: toPublicUser(user), permissions: [...auth.permissions].sort() };
  });
}

/** Fields of a user that may be returned to the browser. Never the internal flags. */
export function toPublicUser(user: {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
}): { id: string; email: string; displayName: string; timezone: string } {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    timezone: user.timezone,
  };
}
