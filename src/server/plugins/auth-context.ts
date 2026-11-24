import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db/client.js";
import { errors } from "../errors.js";
import { getPermissionCodes } from "../services/users.js";
import { resolveSession } from "../services/sessions.js";

export const SESSION_COOKIE = "diary_session";

export interface AuthContext {
  userId: string;
  /** SHA-256 of the session token (also the public session identifier). */
  tokenHash: Buffer;
  permissions: ReadonlySet<string>;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the session hook when the request carries a valid session cookie. */
    auth: AuthContext | null;
  }
}

/**
 * Attaches `request.auth` to every request that carries a live session.
 * It does not reject anything by itself: routes decide with `requireAuth` or `authorize`.
 */
export function registerAuthContext(
  app: FastifyInstance,
  deps: { db: Database; config: AppConfig },
): void {
  app.decorateRequest("auth", null);

  app.addHook("onRequest", async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;

    const session = await resolveSession(deps.db, token, deps.config.SESSION_IDLE_DAYS);
    if (!session) return;

    const permissions = await getPermissionCodes(deps.db, session.userId);
    request.auth = {
      userId: session.userId,
      tokenHash: session.tokenHash,
      permissions: new Set(permissions),
    };
  });
}

/** Rejects requests without a valid session (401). */
/** Rejects requests without a valid session (401). Callback style: Fastify awaits `done`. */
export const requireAuth: preHandlerHookHandler = (request, _reply, done) => {
  done(request.auth ? undefined : errors.unauthenticated());
};

/** Builds a preHandler that requires a session and a specific permission (401 / 403). */
export function authorize(permission: string): preHandlerHookHandler {
  return (request, _reply, done) => {
    if (!request.auth) {
      done(errors.unauthenticated());
      return;
    }
    done(request.auth.permissions.has(permission) ? undefined : errors.forbidden());
  };
}
