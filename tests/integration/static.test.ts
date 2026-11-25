import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/server/app.js";
import { loadConfig } from "../../src/server/config.js";
import { createDatabaseClient, type DatabaseClient } from "../../src/server/db/client.js";
import { CapturingMailer, testEnv } from "../helpers/test-app.js";

describe("serving the built client", () => {
  let root: string;
  let database: DatabaseClient;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "diary-client-"));
    writeFileSync(join(root, "index.html"), "<!doctype html><title>Diario</title>");
    mkdirSync(join(root, "assets"));
    writeFileSync(join(root, "assets", "app.js"), "console.log('ok');");
    database = createDatabaseClient(loadConfig(testEnv()).DATABASE_URL, 2);
  });

  afterAll(async () => {
    await database.close();
    rmSync(root, { recursive: true, force: true });
  });

  async function build() {
    const config = loadConfig(testEnv({ STATIC_DIR: root }));
    return buildApp({ config, database, mailer: new CapturingMailer() }, { logger: false });
  }

  it("serves real files from the client directory", async () => {
    const app = await build();
    try {
      const response = await app.inject({ method: "GET", url: "/assets/app.js" });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("console.log");
    } finally {
      await app.close();
    }
  });

  it("answers client-side routes with index.html so reloads work", async () => {
    const app = await build();
    try {
      const response = await app.inject({ method: "GET", url: "/day/2026-11-24" });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.body).toContain("<title>Diario</title>");
    } finally {
      await app.close();
    }
  });

  it("keeps JSON 404 errors for unknown API paths", async () => {
    const app = await build();
    try {
      const response = await app.inject({ method: "GET", url: "/api/does-not-exist" });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    } finally {
      await app.close();
    }
  });
});
