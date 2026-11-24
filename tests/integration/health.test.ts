import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/server/app.js";
import { loadConfig } from "../../src/server/config.js";
import { createDatabaseClient, type DatabaseClient } from "../../src/server/db/client.js";
import { CapturingMailer, testEnv } from "../helpers/test-app.js";

describe("GET /api/health", () => {
  let database: DatabaseClient;

  beforeAll(() => {
    database = createDatabaseClient(loadConfig(testEnv()).DATABASE_URL, 2);
  });

  afterAll(async () => {
    await database.close();
  });

  it("reports ok when the runtime role can reach the database", async () => {
    const config = loadConfig(testEnv());
    const app = await buildApp(
      { config, database, mailer: new CapturingMailer() },
      { logger: false },
    );

    try {
      const response = await app.inject({ method: "GET", url: "/api/health" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok", database: "ok" });
    } finally {
      await app.close();
    }
  });

  it("reports 503 when the database is unreachable", async () => {
    // Nothing listens on port 1; the connection is refused immediately.
    const unreachable = createDatabaseClient("postgres://diary_app:x@127.0.0.1:1/diary", 1);
    const config = loadConfig(testEnv());
    const app = await buildApp(
      { config, database: unreachable, mailer: new CapturingMailer() },
      { logger: false },
    );

    try {
      const response = await app.inject({ method: "GET", url: "/api/health" });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ status: "error", database: "unavailable" });
    } finally {
      await app.close();
      await unreachable.close();
    }
  });
});
