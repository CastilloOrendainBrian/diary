import type { FastifyInstance } from "fastify";
import { ApiError } from "../errors.js";

/**
 * Converts errors into the API error envelope: { error: { code, message } }.
 * Unexpected errors are logged and returned without internal details.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      void reply
        .code(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
      return;
    }

    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;

    if (statusCode >= 400 && statusCode < 500) {
      // Framework-level client errors (malformed JSON, body too large, rate limit exceeded).
      const code = statusCode === 429 ? "RATE_LIMITED" : "BAD_REQUEST";
      const message = error instanceof Error ? error.message : "Bad request";
      void reply.code(statusCode).send({ error: { code, message } });
      return;
    }

    request.log.error({ err: error }, "Unhandled error");
    void reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "Unexpected error" } });
  });
}
