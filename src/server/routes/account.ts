import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { users } from "../db/schema.js";
import { isValidTimezone } from "../security/email.js";
import { errors } from "../errors.js";
import { authorize } from "../plugins/auth-context.js";
import { listSessions, revokeOwnSession } from "../services/sessions.js";
import { toPublicUser } from "./auth.js";

const SESSION_ID_PATTERN = /^[0-9a-f]{64}$/;

export interface AccountRoutesDeps {
  db: Database;
}

export function registerAccountRoutes(app: FastifyInstance, deps: AccountRoutesDeps): void {
  const { db } = deps;

  app.get("/api/account/sessions", { preHandler: authorize("profile:update") }, async (request) => {
    const auth = request.auth;
    if (!auth) throw errors.unauthenticated();

    const sessions = await listSessions(db, auth.userId);
    return {
      sessions: sessions.map((session) => {
        const id = session.tokenHash.toString("hex");
        return {
          id,
          current: session.tokenHash.equals(auth.tokenHash),
          createdAt: session.createdAt,
          lastSeenAt: session.lastSeenAt,
          expiresAt: session.expiresAt,
          ip: session.ip,
          userAgent: session.userAgent,
        };
      }),
    };
  });

  app.delete<{ Params: { id: string } }>(
    "/api/account/sessions/:id",
    { preHandler: authorize("profile:update") },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) throw errors.unauthenticated();

      const { id } = request.params;
      if (!SESSION_ID_PATTERN.test(id)) {
        throw errors.validation("Invalid session id");
      }

      const revoked = await revokeOwnSession(db, auth.userId, Buffer.from(id, "hex"));
      if (!revoked) {
        // Same response for unknown and foreign sessions, so ids cannot be probed.
        throw errors.notFound("Session");
      }
      return reply.code(204).send();
    },
  );
}

const profileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(60),
    timezone: z.string().min(1).max(64),
  })
  .partial();

/** Lets the signed-in user change their visible name and timezone. */
export function registerProfileRoutes(app: FastifyInstance, deps: AccountRoutesDeps): void {
  const { db } = deps;

  app.patch("/api/account", { preHandler: authorize("profile:update") }, async (request) => {
    const auth = request.auth;
    if (!auth) throw errors.unauthenticated();

    const body = profileSchema.safeParse(request.body);
    if (!body.success) {
      throw errors.validation("displayName must be 1-60 characters and timezone must be set");
    }
    if (body.data.timezone !== undefined && !isValidTimezone(body.data.timezone)) {
      throw errors.validation("timezone must be a valid IANA timezone, e.g. Europe/Madrid");
    }

    const [updated] = await db
      .update(users)
      .set({
        ...(body.data.displayName !== undefined ? { displayName: body.data.displayName } : {}),
        ...(body.data.timezone !== undefined ? { timezone: body.data.timezone } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, auth.userId))
      .returning();
    if (!updated) throw errors.unauthenticated();

    return { user: toPublicUser(updated) };
  });
}
