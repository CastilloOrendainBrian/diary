import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../src/server/db/client.js";
import { runMigrations } from "../../src/server/db/run-migrations.js";
import { MIGRATIONS_DIR, TEST_OWNER_URL } from "../helpers/database-urls.js";
import { openOwnerDatabase } from "../helpers/test-database.js";

describe("migrations", () => {
  let client: DatabaseClient;

  beforeAll(() => {
    client = openOwnerDatabase();
  });

  afterAll(async () => {
    await client.close();
  });

  it("records every migration in the drizzle journal", async () => {
    const result = await client.pool.query<{ count: string }>(
      "SELECT count(*) FROM drizzle.__drizzle_migrations",
    );

    expect(result.rows[0]?.count).toBe("3");
  });

  it("is idempotent: running migrations again changes nothing", async () => {
    const before = await client.pool.query<{ count: string }>(
      "SELECT count(*) FROM drizzle.__drizzle_migrations",
    );

    await runMigrations(TEST_OWNER_URL, MIGRATIONS_DIR);

    const after = await client.pool.query<{ count: string }>(
      "SELECT count(*) FROM drizzle.__drizzle_migrations",
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it("installs the citext and pgcrypto extensions", async () => {
    const result = await client.pool.query<{ extname: string }>(
      "SELECT extname FROM pg_extension WHERE extname IN ('citext', 'pgcrypto') ORDER BY extname",
    );

    expect(result.rows.map((row) => row.extname)).toEqual(["citext", "pgcrypto"]);
  });
});
