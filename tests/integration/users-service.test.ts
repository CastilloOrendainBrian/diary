import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../src/server/db/client.js";
import { createUser, getPermissionCodes } from "../../src/server/services/users.js";
import { openOwnerDatabase, resetDatabase } from "../helpers/test-database.js";

describe("user service", () => {
  let owner: DatabaseClient;

  beforeAll(() => {
    owner = openOwnerDatabase();
  });

  afterAll(async () => {
    await owner.close();
  });

  beforeEach(async () => {
    await resetDatabase(owner);
  });

  it("creates an administrator who also has the user role", async () => {
    const admin = await createUser(owner.db, {
      email: "admin@example.com",
      displayName: "Admin",
      roleNames: ["user", "admin"],
    });

    const permissions = await getPermissionCodes(owner.db, admin.id);
    expect(permissions).toContain("users:manage");
    expect(permissions).toContain("entries:read");
  });

  it("gives a regular user no account-management permissions", async () => {
    const user = await createUser(owner.db, {
      email: "regular@example.com",
      displayName: "Regular",
      roleNames: ["user"],
    });

    const permissions = await getPermissionCodes(owner.db, user.id);
    expect(permissions).not.toContain("users:manage");
    expect(permissions).not.toContain("roles:manage");
    expect(permissions).not.toContain("audit:read");
  });

  it("rejects an unknown role and creates nothing", async () => {
    await expect(
      createUser(owner.db, {
        email: "ghost@example.com",
        displayName: "Ghost",
        roleNames: ["superuser"],
      }),
    ).rejects.toThrow(/Unknown role/);

    const count = await owner.pool.query<{ count: string }>(
      "SELECT count(*) FROM users WHERE email = 'ghost@example.com'",
    );
    expect(count.rows[0]?.count).toBe("0");
  });

  it("rejects a duplicate email regardless of letter case", async () => {
    await createUser(owner.db, {
      email: "dup@example.com",
      displayName: "One",
      roleNames: ["user"],
    });

    await expect(
      owner.pool.query("INSERT INTO users (email, display_name) VALUES ('DUP@example.com', 'Two')"),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
