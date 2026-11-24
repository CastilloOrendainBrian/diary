import type { FastifyInstance } from "fastify";
import { errors } from "../errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Defense in depth against CSRF. Session cookies are SameSite=Strict already; this rejects
 * state-changing API requests from browsers whose Origin header is not the public site.
 * Requests without an Origin header (non-browser clients) are not affected by this check.
 */
export function registerOriginCheck(app: FastifyInstance, publicUrl: string): void {
  const allowedOrigin = new URL(publicUrl).origin;

  app.addHook("onRequest", (request, _reply, done) => {
    if (SAFE_METHODS.has(request.method) || !request.url.startsWith("/api/")) {
      done();
      return;
    }

    const origin = request.headers.origin;
    if (origin !== undefined && origin !== allowedOrigin) {
      done(errors.invalidOrigin());
      return;
    }
    done();
  });
}
