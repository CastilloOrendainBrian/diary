import type { LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../src/server/db/client.js";
import type { SearchHit } from "../../src/shared/search.js";
import { createTestApp, type TestApp } from "../helpers/test-app.js";
import { openOwnerDatabase, resetDatabase } from "../helpers/test-database.js";
import { signInToken, withSession } from "../helpers/auth-helpers.js";

describe("search and export", () => {
  let test: TestApp;
  let owner: DatabaseClient;
  let aliceToken: string;
  let bobToken: string;
  let adminToken: string;

  beforeAll(async () => {
    test = await createTestApp();
    owner = openOwnerDatabase();
  });

  afterAll(async () => {
    await test.close();
    await owner.close();
  });

  beforeEach(async () => {
    await resetDatabase(owner);
    aliceToken = await signInToken(test, "alice@example.com");
    bobToken = await signInToken(test, "bob@example.com");
    adminToken = await signInToken(test, "boss@example.com");
    await owner.pool.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT u.id, r.id FROM users u, roles r
       WHERE u.email = 'boss@example.com' AND r.name = 'admin'`,
    );
    await owner.pool.query(
      `UPDATE users SET display_name = 'Alice' WHERE email = 'alice@example.com'`,
    );

    // The administrator account keeps only the admin role (no diary access).
    await owner.pool.query(
      `DELETE FROM user_roles WHERE user_id = (SELECT id FROM users WHERE email = 'boss@example.com')
        AND role_id = (SELECT id FROM roles WHERE name = 'user')`,
    );
    await create(aliceToken, {
      entryDate: "2026-11-20",
      entryTime: "10:00",
      title: "Viaje",
      content: "Hoy fuimos al mercado de la ciudad con mucha gente.",
      tags: ["ocio"],
    });
    await create(aliceToken, {
      entryDate: "2026-11-21",
      entryTime: "18:00",
      title: "Trabajo",
      content: "Reunión larga sobre presupuestos.",
    });
    await create(bobToken, {
      entryDate: "2026-11-20",
      entryTime: "11:00",
      content: "Bob también fue al mercado.",
    });
  });

  async function create(token: string, body: Record<string, unknown>) {
    const response = await test.app.inject({
      method: "POST",
      url: "/api/entries",
      payload: body,
      headers: withSession(token),
    });
    expect(response.statusCode).toBe(201);
  }

  async function search(token: string, q: string): Promise<LightMyRequestResponse> {
    return test.app.inject({
      method: "GET",
      url: `/api/search?q=${encodeURIComponent(q)}`,
      headers: withSession(token),
    });
  }

  describe("search", () => {
    it("finds notes by word, including Spanish inflections", async () => {
      const response = await search(aliceToken, "mercados");

      expect(response.statusCode).toBe(200);
      const results = response.json<{ results: SearchHit[] }>().results;
      expect(results).toHaveLength(1);
      expect(results[0]?.title).toBe("Viaje");
    });

    it("marks matched words in the snippet with plain-text markers", async () => {
      const results = (await search(aliceToken, "mercado")).json<{ results: SearchHit[] }>()
        .results;

      expect(results[0]?.snippet).toContain("[[mercado]]");
      expect(results[0]?.snippet).not.toContain("<");
    });

    it("never returns another user's notes", async () => {
      const results = (await search(aliceToken, "mercado")).json<{ results: SearchHit[] }>()
        .results;
      const bob = (await search(bobToken, "presupuestos")).json<{ results: SearchHit[] }>().results;

      expect(results).toHaveLength(1);
      expect(bob).toEqual([]);
    });

    it("validates the query", async () => {
      const empty = await search(aliceToken, "   ");
      const tooLong = await search(aliceToken, "a".repeat(201));

      expect(empty.statusCode).toBe(400);
      expect(tooLong.statusCode).toBe(400);
    });

    it("is not available to administrators without diary access", async () => {
      const response = await search(adminToken, "mercado");

      expect(response.statusCode).toBe(403);
    });
  });

  describe("export", () => {
    it("exports only the caller's entries as JSON with an attachment name", async () => {
      const response = await test.app.inject({
        method: "GET",
        url: "/api/export?format=json",
        headers: withSession(aliceToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.headers["content-disposition"]).toMatch(
        /attachment; filename="diario-\d{4}-\d{2}-\d{2}\.json"/,
      );
      const body = response.json<{
        entryCount: number;
        owner: { displayName: string };
        entries: { title: string | null; tags: string[] }[];
      }>();
      expect(body.entryCount).toBe(2);
      expect(body.owner.displayName).toBe("Alice");
      expect(body.entries.map((entry) => entry.title)).toEqual(["Viaje", "Trabajo"]);
      expect(response.body).not.toContain("Bob");
    });

    it("exports Markdown", async () => {
      const response = await test.app.inject({
        method: "GET",
        url: "/api/export?format=md",
        headers: withSession(aliceToken),
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/markdown");
      expect(response.headers["content-disposition"]).toContain(".md");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.body).toContain("## 2026-11-20");
      expect(response.body).not.toContain("Bob");
    });

    it("records every export in the audit log", async () => {
      await test.app.inject({
        method: "GET",
        url: "/api/export?format=md",
        headers: withSession(aliceToken),
      });

      const audit = await owner.pool.query<{
        action: string;
        metadata: { format: string; entryCount: number };
      }>("SELECT action, metadata FROM audit_log WHERE action = 'export.run'");
      expect(audit.rows).toEqual([
        { action: "export.run", metadata: { format: "md", entryCount: 2 } },
      ]);
    });

    it("rejects unknown formats", async () => {
      const response = await test.app.inject({
        method: "GET",
        url: "/api/export?format=pdf",
        headers: withSession(aliceToken),
      });

      expect(response.statusCode).toBe(400);
    });

    it("forbids administrators without diary access and anonymous callers", async () => {
      const admin = await test.app.inject({
        method: "GET",
        url: "/api/export?format=json",
        headers: withSession(adminToken),
      });
      const anonymous = await test.app.inject({ method: "GET", url: "/api/export?format=json" });

      expect(admin.statusCode).toBe(403);
      expect(anonymous.statusCode).toBe(401);
    });
  });
});
