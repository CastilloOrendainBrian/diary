import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import type { DatabaseClient } from "../../src/server/db/client.js";
import { TEST_APP_URL, TEST_BACKUP_URL } from "../helpers/database-urls.js";
import { openOwnerDatabase, resetDatabase } from "../helpers/test-database.js";

/** PostgreSQL "insufficient_privilege". */
const INSUFFICIENT_PRIVILEGE = "42501";

describe("database roles and least privilege", () => {
  let owner: DatabaseClient;
  let app: pg.Pool;
  let backup: pg.Pool;

  beforeAll(() => {
    owner = openOwnerDatabase();
    app = new pg.Pool({ connectionString: TEST_APP_URL, max: 2 });
    backup = new pg.Pool({ connectionString: TEST_BACKUP_URL, max: 1 });
  });

  afterAll(async () => {
    await Promise.all([owner.close(), app.end(), backup.end()]);
  });

  beforeEach(async () => {
    await resetDatabase(owner);
  });

  describe("diary_app (runtime role)", () => {
    it("can read and write the application tables", async () => {
      await app.query("INSERT INTO users (email, display_name) VALUES ('app@example.com', 'App')");

      const result = await app.query<{ count: string }>("SELECT count(*) FROM users");
      expect(result.rows[0]?.count).toBe("1");
    });

    it("cannot change the schema", async () => {
      await expect(app.query("CREATE TABLE intruder (id int)")).rejects.toMatchObject({
        code: INSUFFICIENT_PRIVILEGE,
      });
      await expect(app.query("DROP TABLE users")).rejects.toMatchObject({
        code: INSUFFICIENT_PRIVILEGE,
      });
    });

    it("can append to the audit log", async () => {
      await app.query("INSERT INTO audit_log (action) VALUES ('auth.login.success')");

      const result = await owner.pool.query<{ count: string }>("SELECT count(*) FROM audit_log");
      expect(result.rows[0]?.count).toBe("1");
    });

    it("cannot update or delete audit rows", async () => {
      await owner.pool.query("INSERT INTO audit_log (action) VALUES ('auth.login.success')");

      await expect(app.query("UPDATE audit_log SET action = 'tampered'")).rejects.toMatchObject({
        code: INSUFFICIENT_PRIVILEGE,
      });
      await expect(app.query("DELETE FROM audit_log")).rejects.toMatchObject({
        code: INSUFFICIENT_PRIVILEGE,
      });
    });

    it("can create and update login codes but cannot delete them", async () => {
      await app.query(
        `INSERT INTO login_codes (email, code_hash, expires_at)
         VALUES ('code@example.com', '\\x00', now() + interval '10 minutes')`,
      );
      await app.query("UPDATE login_codes SET attempts = attempts + 1");

      await expect(app.query("DELETE FROM login_codes")).rejects.toMatchObject({
        code: INSUFFICIENT_PRIVILEGE,
      });
    });
  });

  describe("diary_backup (backup role)", () => {
    it("can read every table", async () => {
      await owner.pool.query(
        "INSERT INTO users (email, display_name) VALUES ('b@example.com', 'B')",
      );

      const result = await backup.query<{ count: string }>("SELECT count(*) FROM users");
      expect(result.rows[0]?.count).toBe("1");
    });

    it("reads diary rows of every user despite row level security (BYPASSRLS)", async () => {
      const userIds = await Promise.all(
        ["c1@example.com", "c2@example.com"].map(async (email) => {
          const row = await owner.pool.query<{ id: string }>(
            "INSERT INTO users (email, display_name) VALUES ($1, 'C') RETURNING id",
            [email],
          );
          return row.rows[0]?.id;
        }),
      );
      for (const userId of userIds) {
        await owner.pool.query(
          "INSERT INTO entries (user_id, entry_date, entry_time) VALUES ($1, '2026-01-01', '10:00')",
          [userId],
        );
      }

      const result = await backup.query<{ count: string }>("SELECT count(*) FROM entries");
      expect(result.rows[0]?.count).toBe("2");
    });

    it("cannot write to any table", async () => {
      await expect(
        backup.query("INSERT INTO users (email, display_name) VALUES ('no@example.com', 'No')"),
      ).rejects.toMatchObject({ code: INSUFFICIENT_PRIVILEGE });
    });
  });
});
