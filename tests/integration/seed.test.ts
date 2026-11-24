import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../src/server/db/client.js";
import { seedAccessControl } from "../../src/server/db/seed.js";
import { PERMISSIONS, SYSTEM_ROLES } from "../../src/server/security/permissions.js";
import { openOwnerDatabase, resetDatabase } from "../helpers/test-database.js";

async function permissionsOf(client: DatabaseClient, roleName: string): Promise<string[]> {
  const result = await client.pool.query<{ code: string }>(
    `SELECT p.code
     FROM role_permissions rp
     JOIN roles r ON r.id = rp.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE r.name = $1
     ORDER BY p.code`,
    [roleName],
  );
  return result.rows.map((row) => row.code);
}

describe("access control seed", () => {
  let client: DatabaseClient;

  beforeAll(() => {
    client = openOwnerDatabase();
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await resetDatabase(client);
  });

  it("creates every permission and system role", async () => {
    const permissionCount = await client.pool.query<{ count: string }>(
      "SELECT count(*) FROM permissions",
    );
    const roleCount = await client.pool.query<{ count: string }>(
      "SELECT count(*) FROM roles WHERE is_system",
    );

    expect(permissionCount.rows[0]?.count).toBe(String(PERMISSIONS.length));
    expect(roleCount.rows[0]?.count).toBe(String(SYSTEM_ROLES.length));
  });

  it("is idempotent when applied several times", async () => {
    await seedAccessControl(client.db);
    await seedAccessControl(client.db);

    const grants = await client.pool.query<{ count: string }>(
      "SELECT count(*) FROM role_permissions",
    );
    const expectedGrants = SYSTEM_ROLES.reduce((total, role) => total + role.permissions.length, 0);

    expect(grants.rows[0]?.count).toBe(String(expectedGrants));
  });

  it("gives the user role access to its own diary but not to user management", async () => {
    const codes = await permissionsOf(client, "user");

    expect(codes).toContain("entries:read");
    expect(codes).toContain("entries:write");
    expect(codes).not.toContain("users:manage");
    expect(codes).not.toContain("audit:read");
  });

  it("gives the admin role account management but no diary access", async () => {
    const codes = await permissionsOf(client, "admin");

    expect(codes).toContain("users:manage");
    expect(codes).toContain("roles:manage");
    expect(codes).toContain("audit:read");
    expect(codes).not.toContain("entries:read");
    expect(codes).not.toContain("entries:write");
  });
});
