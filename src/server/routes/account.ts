import type { FastifyInstance } from "fastify";
import type { Database } from "../db/client.js";
import { errors } from "../errors.js";
import { authorize } from "../plugins/auth-context.js";
import { listSessions, revokeOwnSession } from "../services/sessions.js";

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
