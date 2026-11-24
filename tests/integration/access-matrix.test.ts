import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../src/server/db/client.js";
import { createTestApp, type TestApp } from "../helpers/test-app.js";
import { openOwnerDatabase, resetDatabase } from "../helpers/test-database.js";
import { signInToken, withSession } from "../helpers/auth-helpers.js";

const MISSING_USER = "00000000-0000-4000-8000-000000000000";

/**
 * Every administrative endpoint, with a payload that is valid for it. Mutations target a
 * user id that does not exist, so an authorized call can never change data.
 */
const ADMIN_ENDPOINTS = [
  { method: "GET", url: "/api/admin/users" },
  { method: "PATCH", url: `/api/admin/users/${MISSING_USER}`, payload: { status: "disabled" } },
  { method: "PUT", url: `/api/admin/users/${MISSING_USER}/roles`, payload: { roles: ["user"] } },
  { method: "GET", url: "/api/admin/roles" },
  { method: "GET", url: "/api/admin/audit" },
] as const;

describe("access matrix: endpoint x role", () => {
  let test: TestApp;
  let owner: DatabaseClient;
  let userToken: string;
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
    userToken = await signInToken(test, "regular@example.com");
    adminToken = await signInToken(test, "boss@example.com");
    await owner.pool.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT u.id, r.id FROM users u, roles r
       WHERE u.email = 'boss@example.com' AND r.name = 'admin'`,
    );
  });

  for (const endpoint of ADMIN_ENDPOINTS) {
    describe(`${endpoint.method} ${endpoint.url.replace(MISSING_USER, ":id")}`, () => {
      it("answers 401 without a session", async () => {
        const response = await test.app.inject({ ...endpoint });

        expect(response.statusCode).toBe(401);
      });

      it("answers 403 to a regular user", async () => {
        const response = await test.app.inject({ ...endpoint, headers: withSession(userToken) });

        expect(response.statusCode).toBe(403);
        expect(response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
      });

      it("lets an administrator through", async () => {
        const response = await test.app.inject({ ...endpoint, headers: withSession(adminToken) });

        // 404 is the expected result for the missing user on mutation endpoints.
        expect([200, 404]).toContain(response.statusCode);
      });
    });
  }

  it("lets every signed-in user manage their own sessions", async () => {
    for (const token of [userToken, adminToken]) {
      const response = await test.app.inject({
        method: "GET",
        url: "/api/account/sessions",
        headers: withSession(token),
      });
      expect(response.statusCode).toBe(200);
    }
  });

  it("gives a narrow custom role only the permissions it was granted", async () => {
    await owner.pool.query(
      `INSERT INTO roles (name, description) VALUES ('auditor', 'Read-only audit access')`,
    );
    await owner.pool.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT r.id, p.id FROM roles r, permissions p
       WHERE r.name = 'auditor' AND p.code = 'audit:read'`,
    );
    await owner.pool.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT u.id, r.id FROM users u, roles r
       WHERE u.email = 'regular@example.com' AND r.name = 'auditor'`,
    );

    const audit = await test.app.inject({
      method: "GET",
      url: "/api/admin/audit",
      headers: withSession(userToken),
    });
    const users = await test.app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: withSession(userToken),
    });

    expect(audit.statusCode).toBe(200);
    expect(users.statusCode).toBe(403);
  });
});
