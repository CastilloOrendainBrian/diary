import { readFileSync } from "node:fs";
import pg from "pg";
import { runMigrations } from "../../src/server/db/run-migrations.js";
import {
  GRANTS_SQL_PATH,
  MIGRATIONS_DIR,
  TEST_ADMIN_URL,
  TEST_DATABASE_NAME,
  TEST_OWNER_URL,
} from "../helpers/database-urls.js";

/**
 * Recreates the diary_test database from scratch, applies the role grants and
 * runs all migrations. Runs once before the integration test files.
 */
export default async function setup(): Promise<void> {
  const admin = new pg.Client({ connectionString: TEST_ADMIN_URL });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE_NAME} OWNER diary_owner`);
  } finally {
    await admin.end();
  }

  const grantsSql = readFileSync(GRANTS_SQL_PATH, "utf8");
  const owner = new pg.Client({ connectionString: TEST_OWNER_URL });
  await owner.connect();
  try {
    await owner.query(grantsSql);
  } finally {
    await owner.end();
  }

  await runMigrations(TEST_OWNER_URL, MIGRATIONS_DIR);
}
