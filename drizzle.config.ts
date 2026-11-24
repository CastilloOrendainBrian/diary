import { defineConfig } from "drizzle-kit";

// Used only to generate migration files. Runtime connections come from environment variables.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./src/server/db/migrations",
});
