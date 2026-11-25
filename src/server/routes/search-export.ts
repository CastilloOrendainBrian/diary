import type { FastifyInstance, FastifyRequest } from "fastify";
import { exportQuerySchema, searchQuerySchema } from "../../shared/search.js";
import { rangeFor } from "../../shared/range.js";
import type { Database } from "../db/client.js";
import { withUserContext } from "../db/rls.js";
import { errors } from "../errors.js";
import { authorize } from "../plugins/auth-context.js";
import { recordAudit } from "../services/audit.js";
import { exportFileName, renderJsonExport, renderMarkdownExport } from "../services/export.js";
import { listEntries } from "../services/entries.js";
import { searchEntries } from "../services/search.js";
import { findUserById } from "../services/users.js";
import { todayIn } from "../../shared/time.js";

export interface SearchExportRoutesDeps {
  db: Database;
}

export function registerSearchExportRoutes(
  app: FastifyInstance,
  deps: SearchExportRoutesDeps,
): void {
  const { db } = deps;

  app.get("/api/search", { preHandler: authorize("entries:read") }, async (request) => {
    const query = searchQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw errors.validation(`q ${query.error.issues[0]?.message ?? "is invalid"}`);
    }
    const userId = userIdOf(request);
    const hits = await withUserContext(db, userId, (tx) =>
      searchEntries(tx, userId, query.data.q, query.data.limit),
    );
    return { results: hits };
  });

  app.get("/api/export", { preHandler: authorize("export:run") }, async (request, reply) => {
    const query = exportQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw errors.validation("format must be 'json' or 'md'");
    }
    const userId = userIdOf(request);
    const owner = await findUserById(db, userId);
    if (!owner) throw errors.unauthenticated();

    const exportedAt = new Date();
    const entries = await withUserContext(db, userId, (tx) =>
      listEntries(tx, userId, rangeFor.all()),
    );

    await recordAudit(db, {
      action: "export.run",
      actorId: userId,
      targetType: "user",
      targetId: userId,
      ip: request.ip,
      metadata: { format: query.data.format, entryCount: entries.length },
    });

    const fileName = exportFileName(query.data.format, todayIn(owner.timezone, exportedAt));
    const ownerInfo = { displayName: owner.displayName, timezone: owner.timezone };

    if (query.data.format === "json") {
      reply.header("Content-Type", "application/json; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
      reply.header("X-Content-Type-Options", "nosniff");
      return renderJsonExport(ownerInfo, entries, exportedAt);
    }

    reply.header("Content-Type", "text/markdown; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${fileName}"`);
    reply.header("X-Content-Type-Options", "nosniff");
    return renderMarkdownExport(ownerInfo, entries, exportedAt);
  });
}

function userIdOf(request: FastifyRequest): string {
  if (!request.auth) throw errors.unauthenticated();
  return request.auth.userId;
}
