import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabaseClient } from "./db/client.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const database = createDatabaseClient(config.DATABASE_URL, config.DATABASE_POOL_MAX);

  const app = buildApp(
    {
      checkDatabase: async () => {
        await database.pool.query("select 1");
      },
    },
    { logger: config.NODE_ENV !== "test" },
  );

  // Close the server and the pool cleanly on termination signals (Ctrl+C in dev, docker stop in prod).
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "Shutting down");
    await app.close();
    await database.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
