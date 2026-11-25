// CLI entry point used by the `migrate` container and `npm run db:migrate`.
// It reads only the owner connection string, so the migration container never receives the
// runtime secrets (HMAC key, mail key, application database password).
import { readSecretEnv } from "../config.js";
import { runMigrations } from "./run-migrations.js";

async function main(): Promise<void> {
  const connectionString = readSecretEnv(process.env, "DATABASE_MIGRATION_URL");
  if (!connectionString) {
    throw new Error("DATABASE_MIGRATION_URL (or DATABASE_MIGRATION_URL_FILE) is required");
  }
  const migrationsDir = process.env.MIGRATIONS_DIR ?? "src/server/db/migrations";

  await runMigrations(connectionString, migrationsDir);
  console.log("Migrations applied and access control seeded.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
