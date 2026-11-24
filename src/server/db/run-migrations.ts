import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabaseClient } from "./client.js";
import { seedAccessControl } from "./seed.js";

/**
 * Applies pending migrations and then synchronizes the seed data.
 * Must run with the owner role (diary_owner), never with the runtime role.
 */
export async function runMigrations(
  connectionString: string,
  migrationsFolder: string,
): Promise<void> {
  const client = createDatabaseClient(connectionString, 1);
  try {
    await migrate(client.db, { migrationsFolder });
    await seedAccessControl(client.db);
  } finally {
    await client.close();
  }
}
