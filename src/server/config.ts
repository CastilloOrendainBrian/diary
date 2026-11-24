import { readFileSync } from "node:fs";
import { z } from "zod";

type EnvSource = Readonly<Record<string, string | undefined>>;
type FileReader = (path: string) => string;

/**
 * Reads a secret from `NAME_FILE` (path to a file, e.g. a Docker secret)
 * when present, otherwise from `NAME`. Trailing newlines are removed.
 */
export function readSecretEnv(
  env: EnvSource,
  name: string,
  readFile: FileReader = (path) => readFileSync(path, "utf8"),
): string | undefined {
  const filePath = env[`${name}_FILE`];
  if (filePath !== undefined && filePath !== "") {
    return readFile(filePath).trim();
  }
  const value = env[name];
  return value === undefined || value === "" ? undefined : value;
}

const postgresUrl = z
  .string()
  .refine((value) => /^postgres(ql)?:\/\//.test(value), "must be a postgres:// URL");

// Environment variables are validated once at startup. Invalid or missing
// values fail fast with a readable error instead of surfacing later.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  /** Connection string for the runtime role (diary_app). Required by the server. */
  DATABASE_URL: postgresUrl,
  /** Connection string for the owner role (diary_owner). Only used by migrations. */
  DATABASE_MIGRATION_URL: postgresUrl.optional(),
  /** Directory with Drizzle migration files, relative to the working directory. */
  MIGRATIONS_DIR: z.string().default("src/server/db/migrations"),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
});

export type AppConfig = z.infer<typeof envSchema>;

const SECRET_NAMES = ["DATABASE_URL", "DATABASE_MIGRATION_URL"] as const;

export function loadConfig(
  env: EnvSource = process.env,
  readFile: FileReader = (path) => readFileSync(path, "utf8"),
): AppConfig {
  const resolved: Record<string, string | undefined> = { ...env };
  for (const name of SECRET_NAMES) {
    resolved[name] = readSecretEnv(env, name, readFile);
  }

  const parsed = envSchema.safeParse(resolved);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return parsed.data;
}

/** Returns the migration connection string or fails with a clear message. */
export function requireMigrationUrl(config: AppConfig): string {
  if (!config.DATABASE_MIGRATION_URL) {
    throw new Error("DATABASE_MIGRATION_URL (or DATABASE_MIGRATION_URL_FILE) is required");
  }
  return config.DATABASE_MIGRATION_URL;
}
