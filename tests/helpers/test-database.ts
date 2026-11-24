import { createDatabaseClient, type DatabaseClient } from "../../src/server/db/client.js";
import { seedAccessControl } from "../../src/server/db/seed.js";
import { TEST_OWNER_URL } from "./database-urls.js";

/** Tables truncated between tests (seed data is re-applied afterwards). */
const APPLICATION_TABLES = [
  "audit_log",
  "entry_tags",
  "entries",
  "tags",
  "sessions",
  "login_codes",
  "user_roles",
  "role_permissions",
  "users",
  "roles",
  "permissions",
];

/** Opens a client as the owner role against diary_test. Close it with `close()`. */
export function openOwnerDatabase(): DatabaseClient {
  return createDatabaseClient(TEST_OWNER_URL, 2);
}

/** Removes all rows and restores the seed data. */
export async function resetDatabase(client: DatabaseClient): Promise<void> {
  await client.pool.query(`TRUNCATE ${APPLICATION_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  await seedAccessControl(client.db);
}
