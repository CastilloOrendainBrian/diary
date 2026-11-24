import fastifyCookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import type { DatabaseClient } from "./db/client.js";
import type { MailService } from "./mail/mailer.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { registerAuthContext } from "./plugins/auth-context.js";
import { registerOriginCheck } from "./plugins/origin-check.js";
import { registerAccountRoutes } from "./routes/account.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { AuthCodeService } from "./services/auth-codes.js";

export interface AppDependencies {
  config: AppConfig;
  database: DatabaseClient;
  mailer: MailService;
}

export interface AppOptions {
  /** Set to false in tests to keep the output quiet. */
  logger?: boolean;
}

declare module "fastify" {
  interface FastifyInstance {
    /** Login code service, exposed so tests and jobs can wait for pending email delivery. */
    authCodes: AuthCodeService;
  }
}

/**
 * Builds the Fastify instance without listening on a port, so tests can call `app.inject()`.
 */
export async function buildApp(
  deps: AppDependencies,
  options: AppOptions = {},
): Promise<FastifyInstance> {
  const { config, database, mailer } = deps;

  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : { redact: ["req.headers.cookie", "req.headers.authorization"] },
    // Trust X-Forwarded-For only from the configured proxy (nginx). Unset means "do not trust".
    trustProxy: config.TRUST_PROXY ?? false,
  });

  const authCodes = new AuthCodeService({ db: database.db, mailer, config });
  app.decorate("authCodes", authCodes);

  registerErrorHandler(app);
  await app.register(fastifyCookie);
  await app.register(rateLimit, { global: false });
  registerAuthContext(app, { db: database.db, config });
  registerOriginCheck(app, config.PUBLIC_URL);

  app.get("/api/health", async (request, reply) => {
    try {
      await database.pool.query("select 1");
      return { status: "ok", database: "ok" };
    } catch (error) {
      request.log.error({ err: error }, "Database health check failed");
      // Do not await reply.code(): FastifyReply is thenable and awaiting it would hang.
      reply.code(503);
      return { status: "error", database: "unavailable" };
    }
  });

  registerAuthRoutes(app, { db: database.db, config, authCodes });
  registerAccountRoutes(app, { db: database.db });
  registerAdminRoutes(app, { db: database.db });

  return app;
}
