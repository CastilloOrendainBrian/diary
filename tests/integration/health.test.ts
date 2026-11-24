import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/server/app.js";
import { createDatabaseClient, type DatabaseClient } from "../../src/server/db/client.js";
import { TEST_APP_URL } from "../helpers/database-urls.js";

describe("GET /api/health with a real database", () => {
  let database: DatabaseClient;

  beforeAll(() => {
    database = createDatabaseClient(TEST_APP_URL, 2);
  });

  afterAll(async () => {
    await database.close();
  });

  it("reports ok when the runtime role can reach the database", async () => {
    const app = buildApp(
      {
        checkDatabase: async () => {
          await database.pool.query("select 1");
        },
      },
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
});
