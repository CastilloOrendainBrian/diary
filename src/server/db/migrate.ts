// CLI entry point used by the `migrate` container and `npm run db:migrate`.
import { loadConfig, requireMigrationUrl } from "../config.js";
import { runMigrations } from "./run-migrations.js";

async function main(): Promise<void> {
  const config = loadConfig();
  await runMigrations(requireMigrationUrl(config), config.MIGRATIONS_DIR);
  console.log("Migrations applied and access control seeded.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
