import Fastify, { type FastifyInstance } from "fastify";

export interface AppDependencies {
  /** Resolves when the database answers; rejects otherwise. Used by the health check. */
  checkDatabase: () => Promise<void>;
}

export interface AppOptions {
  logger?: boolean;
}

// Builds the Fastify instance without starting it, so tests can call
// `app.inject()` without opening a network port.
export function buildApp(deps: AppDependencies, options: AppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? true,
  });

  app.get("/api/health", async (request, reply) => {
    try {
      await deps.checkDatabase();
      return { status: "ok", database: "ok" };
    } catch (error) {
      request.log.error({ err: error }, "Database health check failed");
      // Do not await reply.code(): FastifyReply is thenable and awaiting it would hang.
      reply.code(503);
      return { status: "error", database: "unavailable" };
    }
  });

  return app;
}
