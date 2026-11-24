import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../src/server/db/client.js";
import { createTestApp, type TestApp } from "../helpers/test-app.js";
import { openOwnerDatabase, resetDatabase } from "../helpers/test-database.js";
import {
  requestCode,
  signIn,
  signInToken,
  verifyCode,
  withSession,
} from "../helpers/auth-helpers.js";
import { setUserStatus } from "../../src/server/services/admin.js";
import { ApiError } from "../../src/server/errors.js";

const MISSING_USER = "00000000-0000-4000-8000-000000000000";

/** Gives an existing account the admin role directly in the database. */
async function promoteToAdmin(owner: DatabaseClient, email: string): Promise<void> {
  await owner.pool.query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT u.id, r.id FROM users u, roles r
     WHERE u.email = $1 AND r.name = 'admin'
     ON CONFLICT DO NOTHING`,
    [email],
  );
}

async function userIdOf(owner: DatabaseClient, email: string): Promise<string> {
  const result = await owner.pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    email,
  ]);
  const id = result.rows[0]?.id;
  if (!id) throw new Error(`no user ${email}`);
  return id;
}

describe("administration of accounts and roles", () => {
  let test: TestApp;
  let owner: DatabaseClient;
  let adminToken: string;
  let memberToken: string;
  let memberId: string;
  let adminId: string;
  let secondAdminId: string;

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
    test.mailer.clear();

    adminToken = await signInToken(test, "admin@example.com");
    await signInToken(test, "second-admin@example.com");
    memberToken = await signInToken(test, "member@example.com");
    await promoteToAdmin(owner, "admin@example.com");
    await promoteToAdmin(owner, "second-admin@example.com");
    adminId = await userIdOf(owner, "admin@example.com");
    memberId = await userIdOf(owner, "member@example.com");
    secondAdminId = await userIdOf(owner, "second-admin@example.com");
  });

  async function patchStatus(token: string, id: string, status: unknown) {
    return test.app.inject({
      method: "PATCH",
      url: `/api/admin/users/${id}`,
      payload: { status },
      headers: withSession(token),
    });
  }

  it("lists accounts with their roles and no diary content", async () => {
    const response = await test.app.inject({
      method: "GET",
      url: "/api/admin/users",
      headers: withSession(adminToken),
    });

    expect(response.statusCode).toBe(200);
    const users = response.json<{ users: { email: string; roles: string[] }[] }>().users;
    expect(users.map((user) => user.email)).toEqual([
      "admin@example.com",
      "member@example.com",
      "second-admin@example.com",
    ]);
    expect(users.find((user) => user.email === "member@example.com")?.roles).toEqual(["user"]);
    expect(JSON.stringify(users)).not.toMatch(/content|search_vector|password|code_hash|token/);
  });

  it("disables an account, revokes its sessions and records the action", async () => {
    const response = await patchStatus(adminToken, memberId, "disabled");

    expect(response.statusCode).toBe(200);
    expect(response.json<{ user: { status: string } }>().user.status).toBe("disabled");

    const memberAccess = await test.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: withSession(memberToken),
    });
    expect(memberAccess.statusCode).toBe(401);

    const audit = await owner.pool.query<{ actor_id: string; target_id: string }>(
      "SELECT actor_id, target_id FROM audit_log WHERE action = 'admin.user.disabled'",
    );
    expect(audit.rows).toEqual([{ actor_id: adminId, target_id: memberId }]);
  });

  it("prevents a disabled account from signing in again", async () => {
    await patchStatus(adminToken, memberId, "disabled");
    test.mailer.clear();

    const requested = await requestCode(test.app, "member@example.com");
    await test.app.authCodes.waitForDeliveries();
    const response = await verifyCode(test.app, { email: "member@example.com", code: "123456" });

    expect(requested.statusCode).toBe(202);
    expect(test.mailer.messages).toHaveLength(0);
    expect(response.statusCode).toBe(401);
  });

  it("re-enables an account so it can sign in again", async () => {
    await patchStatus(adminToken, memberId, "disabled");

    const response = await patchStatus(adminToken, memberId, "active");
    expect(response.statusCode).toBe(200);

    const signedIn = await signIn(test, "member@example.com");
    expect(signedIn.statusCode).toBe(200);
  });

  it("does nothing when the status is already the requested one", async () => {
    const response = await patchStatus(adminToken, memberId, "active");

    expect(response.statusCode).toBe(200);
    const audit = await owner.pool.query(
      "SELECT 1 FROM audit_log WHERE action LIKE 'admin.user.%'",
    );
    expect(audit.rows).toHaveLength(0);
  });

  it("does not let an administrator disable their own account", async () => {
    const response = await patchStatus(adminToken, adminId, "disabled");

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "CANNOT_MODIFY_SELF" } });
  });

  it("rejects an unknown status value", async () => {
    const response = await patchStatus(adminToken, memberId, "locked");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("returns 404 for an unknown or malformed user id", async () => {
    const unknown = await patchStatus(adminToken, MISSING_USER, "disabled");
    const malformed = await patchStatus(adminToken, "not-a-uuid", "disabled");

    expect(unknown.statusCode).toBe(404);
    expect(malformed.statusCode).toBe(404);
  });

  it("keeps at least one active administrator when two admins disable each other at once", async () => {
    // Exercised at service level: disabling an admin revokes that admin's sessions, which would
    // make the HTTP requests race against their own authentication.
    const results = await Promise.allSettled([
      setUserStatus(test.database.db, { userId: adminId, ip: null }, secondAdminId, "disabled"),
      setUserStatus(test.database.db, { userId: secondAdminId, ip: null }, adminId, "disabled"),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(ApiError);
    expect((rejected[0]?.reason as ApiError).code).toBe("LAST_ADMIN");

    const active = await owner.pool.query<{ count: string }>(
      "SELECT count(*) FROM users u JOIN user_roles ur ON ur.user_id = u.id " +
        "JOIN roles r ON r.id = ur.role_id WHERE r.name = 'admin' AND u.status = 'active'",
    );
    expect(active.rows[0]?.count).toBe("1");
  });

  it("grants and revokes roles, always keeping the user role", async () => {
    const grant = await test.app.inject({
      method: "PUT",
      url: `/api/admin/users/${memberId}/roles`,
      payload: { roles: ["user", "admin"] },
      headers: withSession(adminToken),
    });
    expect(grant.statusCode).toBe(200);
    expect(grant.json<{ user: { roles: string[] } }>().user.roles).toEqual(["admin", "user"]);

    const withoutUser = await test.app.inject({
      method: "PUT",
      url: `/api/admin/users/${memberId}/roles`,
      payload: { roles: ["admin"] },
      headers: withSession(adminToken),
    });
    expect(withoutUser.statusCode).toBe(400);
    expect(withoutUser.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("rejects unknown role names", async () => {
    const response = await test.app.inject({
      method: "PUT",
      url: `/api/admin/users/${memberId}/roles`,
      payload: { roles: ["user", "superuser"] },
      headers: withSession(adminToken),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { message: string } }>().error.message).toContain("superuser");
  });

  it("does not let an administrator remove their own admin role", async () => {
    const response = await test.app.inject({
      method: "PUT",
      url: `/api/admin/users/${adminId}/roles`,
      payload: { roles: ["user"] },
      headers: withSession(adminToken),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "CANNOT_MODIFY_SELF" } });
  });

  it("allows removing the admin role from another administrator while one remains", async () => {
    const response = await test.app.inject({
      method: "PUT",
      url: `/api/admin/users/${secondAdminId}/roles`,
      payload: { roles: ["user"] },
      headers: withSession(adminToken),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ user: { roles: string[] } }>().user.roles).toEqual(["user"]);
  });

  it("records role changes with the before and after role sets", async () => {
    await test.app.inject({
      method: "PUT",
      url: `/api/admin/users/${memberId}/roles`,
      payload: { roles: ["user", "admin"] },
      headers: withSession(adminToken),
    });

    const audit = await test.app.inject({
      method: "GET",
      url: "/api/admin/audit?action=admin.user.roles_changed",
      headers: withSession(adminToken),
    });

    const events = audit.json<{ events: { actorId: string; metadata: unknown }[] }>().events;
    expect(events).toHaveLength(1);
    expect(events[0]?.actorId).toBe(adminId);
    expect(events[0]?.metadata).toEqual({ before: ["user"], after: ["admin", "user"] });
  });

  it("lists roles with their permissions", async () => {
    const response = await test.app.inject({
      method: "GET",
      url: "/api/admin/roles",
      headers: withSession(adminToken),
    });

    const list = response.json<{ roles: { name: string; permissions: string[] }[] }>().roles;
    const admin = list.find((role) => role.name === "admin");
    expect(admin?.permissions).toContain("users:manage");
    expect(admin?.permissions).not.toContain("entries:read");
  });

  it("filters the audit log by actor and action", async () => {
    await patchStatus(adminToken, memberId, "disabled");
    await patchStatus(adminToken, memberId, "active");

    const response = await test.app.inject({
      method: "GET",
      url: `/api/admin/audit?actorId=${adminId}&action=admin.user.enabled`,
      headers: withSession(adminToken),
    });

    const events = response.json<{ events: { action: string }[] }>().events;
    expect(events.map((event) => event.action)).toEqual(["admin.user.enabled"]);
  });

  it("validates the audit query", async () => {
    const response = await test.app.inject({
      method: "GET",
      url: "/api/admin/audit?limit=5000",
      headers: withSession(adminToken),
    });

    expect(response.statusCode).toBe(400);
  });
});
