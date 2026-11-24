import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../src/server/db/client.js";
import { openOwnerDatabase, resetDatabase } from "../helpers/test-database.js";

const EXPECTED_TABLES = [
  "audit_log",
  "entries",
  "entry_tags",
  "login_codes",
  "permissions",
  "role_permissions",
  "roles",
  "sessions",
  "tags",
  "user_roles",
  "users",
];

/** PostgreSQL error codes used in assertions. */
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";

async function insertUser(
  client: DatabaseClient,
  email: string,
  displayName = "Test",
): Promise<string> {
  const result = await client.pool.query<{ id: string }>(
    "INSERT INTO users (email, display_name) VALUES ($1, $2) RETURNING id",
    [email, displayName],
  );
  const row = result.rows[0];
  if (!row) throw new Error("insert returned no row");
  return row.id;
}

async function expectPgError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("database schema", () => {
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

  it("creates every table of the data model", async () => {
    const result = await client.pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const tables = result.rows.map((row) => row.table_name);

    for (const table of EXPECTED_TABLES) {
      expect(tables).toContain(table);
    }
  });

  it("treats emails as case-insensitive and unique", async () => {
    await insertUser(client, "Ana@Example.com");

    await expectPgError(insertUser(client, "ana@example.com"), UNIQUE_VIOLATION);
  });

  it("rejects users with an unknown status", async () => {
    await expectPgError(
      client.pool.query(
        "INSERT INTO users (email, display_name, status) VALUES ('x@example.com', 'X', 'locked')",
      ),
      CHECK_VIOLATION,
    );
  });

  it("rejects a display name longer than 60 characters", async () => {
    await expectPgError(
      client.pool.query("INSERT INTO users (email, display_name) VALUES ($1, $2)", [
        "long@example.com",
        "a".repeat(61),
      ]),
      CHECK_VIOLATION,
    );
  });

  it("stores entry time with minute precision and rejects seconds", async () => {
    const userId = await insertUser(client, "time@example.com");

    const inserted = await client.pool.query<{ entry_time: string }>(
      `INSERT INTO entries (user_id, entry_date, entry_time, content)
       VALUES ($1, '2026-11-23', '09:05', 'morning') RETURNING entry_time`,
      [userId],
    );
    expect(inserted.rows[0]?.entry_time).toBe("09:05:00");

    await expectPgError(
      client.pool.query(
        `INSERT INTO entries (user_id, entry_date, entry_time, content)
         VALUES ($1, '2026-11-23', '09:05:30', 'with seconds')`,
        [userId],
      ),
      CHECK_VIOLATION,
    );
  });

  it("orders entries of a day by time", async () => {
    const userId = await insertUser(client, "order@example.com");
    for (const time of ["18:30", "07:15", "12:00"]) {
      await client.pool.query(
        "INSERT INTO entries (user_id, entry_date, entry_time) VALUES ($1, '2026-11-23', $2)",
        [userId, time],
      );
    }

    const result = await client.pool.query<{ entry_time: string }>(
      `SELECT entry_time FROM entries WHERE user_id = $1 AND entry_date = '2026-11-23'
       ORDER BY entry_time`,
      [userId],
    );

    expect(result.rows.map((row) => row.entry_time)).toEqual(["07:15:00", "12:00:00", "18:30:00"]);
  });

  it("allows the same tag name for different users but not twice for one user", async () => {
    const first = await insertUser(client, "first@example.com");
    const second = await insertUser(client, "second@example.com");

    await client.pool.query("INSERT INTO tags (user_id, name) VALUES ($1, 'travel')", [first]);
    await client.pool.query("INSERT INTO tags (user_id, name) VALUES ($1, 'travel')", [second]);

    await expectPgError(
      client.pool.query("INSERT INTO tags (user_id, name) VALUES ($1, 'travel')", [first]),
      UNIQUE_VIOLATION,
    );
  });

  it("deletes entries and tags when their user is deleted", async () => {
    const userId = await insertUser(client, "cascade@example.com");
    const entry = await client.pool.query<{ id: string }>(
      "INSERT INTO entries (user_id, entry_date, entry_time) VALUES ($1, '2026-01-01', '08:00') RETURNING id",
      [userId],
    );
    await client.pool.query("INSERT INTO tags (user_id, name) VALUES ($1, 'work')", [userId]);

    await client.pool.query("DELETE FROM users WHERE id = $1", [userId]);

    const remaining = await client.pool.query<{ entries: string; tags: string }>(
      `SELECT
         (SELECT count(*) FROM entries WHERE id = $1) AS entries,
         (SELECT count(*) FROM tags WHERE user_id = $2) AS tags`,
      [entry.rows[0]?.id, userId],
    );
    expect(remaining.rows[0]).toEqual({ entries: "0", tags: "0" });
  });

  it("rejects an entry tag that points to a missing entry", async () => {
    const userId = await insertUser(client, "fk@example.com");
    const tag = await client.pool.query<{ id: number }>(
      "INSERT INTO tags (user_id, name) VALUES ($1, 'fk') RETURNING id",
      [userId],
    );

    await expectPgError(
      client.pool.query(
        "INSERT INTO entry_tags (entry_id, tag_id) VALUES (gen_random_uuid(), $1)",
        [tag.rows[0]?.id],
      ),
      FOREIGN_KEY_VIOLATION,
    );
  });

  it("indexes entry text for Spanish full-text search", async () => {
    const userId = await insertUser(client, "search@example.com");
    await client.pool.query(
      `INSERT INTO entries (user_id, entry_date, entry_time, title, content)
       VALUES ($1, '2026-11-23', '10:00', 'Viaje', 'Hoy fuimos al mercado de la ciudad')`,
      [userId],
    );

    const result = await client.pool.query<{ count: string }>(
      `SELECT count(*) FROM entries
       WHERE search_vector @@ websearch_to_tsquery('spanish', 'mercado')`,
    );

    expect(result.rows[0]?.count).toBe("1");
  });

  it("keeps audit rows when the actor is deleted", async () => {
    const actorId = await insertUser(client, "actor@example.com");
    await client.pool.query(
      "INSERT INTO audit_log (actor_id, action) VALUES ($1, 'auth.login.success')",
      [actorId],
    );

    await client.pool.query("DELETE FROM users WHERE id = $1", [actorId]);

    const result = await client.pool.query<{ actor_id: string | null; action: string }>(
      "SELECT actor_id, action FROM audit_log",
    );
    expect(result.rows).toEqual([{ actor_id: null, action: "auth.login.success" }]);
  });
});
