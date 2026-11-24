import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  auditQuerySchema,
  updateUserRolesSchema,
  updateUserStatusSchema,
} from "../../shared/admin.js";
import type { Database } from "../db/client.js";
import { errors } from "../errors.js";
import { authorize } from "../plugins/auth-context.js";
import {
  listAuditEvents,
  listRoles,
  listUsers,
  setUserRoles,
  setUserStatus,
  type AdminActor,
} from "../services/admin.js";

export interface AdminRoutesDeps {
  db: Database;
}

export function registerAdminRoutes(app: FastifyInstance, deps: AdminRoutesDeps): void {
  const { db } = deps;

  app.get("/api/admin/users", { preHandler: authorize("users:read") }, async () => ({
    users: await listUsers(db),
  }));

  app.patch<{ Params: { id: string } }>(
    "/api/admin/users/:id",
    { preHandler: authorize("users:manage") },
    async (request) => {
      const body = updateUserStatusSchema.safeParse(request.body);
      if (!body.success) {
        throw errors.validation("status must be 'active' or 'disabled'");
      }
      const user = await setUserStatus(
        db,
        actorOf(request),
        parseUserId(request.params.id),
        body.data.status,
      );
      return { user };
    },
  );

  app.put<{ Params: { id: string } }>(
    "/api/admin/users/:id/roles",
    { preHandler: authorize("roles:manage") },
    async (request) => {
      const body = updateUserRolesSchema.safeParse(request.body);
      if (!body.success) {
        throw errors.validation("roles must be a non-empty list of role names");
      }
      const user = await setUserRoles(
        db,
        actorOf(request),
        parseUserId(request.params.id),
        body.data.roles,
      );
      return { user };
    },
  );

  app.get("/api/admin/roles", { preHandler: authorize("roles:manage") }, async () => ({
    roles: await listRoles(db),
  }));

  app.get("/api/admin/audit", { preHandler: authorize("audit:read") }, async (request) => {
    const query = auditQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw errors.validation("Invalid audit query parameters");
    }
    return { events: await listAuditEvents(db, query.data) };
  });
}

function actorOf(request: FastifyRequest): AdminActor {
  if (!request.auth) throw errors.unauthenticated();
  return { userId: request.auth.userId, ip: request.ip };
}

/** Malformed ids cannot match any user, so they are reported as not found. */
function parseUserId(value: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw errors.notFound("User");
  return parsed.data;
}
