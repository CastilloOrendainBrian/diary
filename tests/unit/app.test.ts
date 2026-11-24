import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/server/app.js";

describe("GET /api/health", () => {
  const apps: ReturnType<typeof buildApp>[] = [];

  afterEach(async () => {
    await Promise.all(apps.map((app) => app.close()));
    apps.length = 0;
  });

  it("reports ok when the database check succeeds", async () => {
    const app = buildApp({ checkDatabase: () => Promise.resolve() }, { logger: false });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", database: "ok" });
  });

  it("returns 503 when the database check fails", async () => {
    const app = buildApp(
      { checkDatabase: () => Promise.reject(new Error("connection refused")) },
      { logger: false },
    );
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "error", database: "unavailable" });
  });
});
