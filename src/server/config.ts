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

const SECRET_NAMES = [
  "DATABASE_URL",
  "DATABASE_MIGRATION_URL",
  "CODE_HMAC_SECRET",
  "RESEND_API_KEY",
] as const;

const postgresUrl = z
  .string()
  .refine((value) => /^postgres(ql)?:\/\//.test(value), "must be a postgres:// URL");

/** "true" / "false" strings from the environment. */
const booleanFlag = (defaultValue: boolean) =>
  z
    .enum(["true", "false"])
    .default(defaultValue ? "true" : "false")
    .transform((value) => value === "true");

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default("0.0.0.0"),
    /** Public origin of the site, used for the CSRF Origin check and links. */
    PUBLIC_URL: z.url().default("http://localhost:5173"),
    /** Value passed to Fastify `trustProxy` (e.g. the Docker network CIDR). Unset = do not trust. */
    TRUST_PROXY: z.string().optional(),

    // Database
    /** Connection string for the runtime role (diary_app). */
    DATABASE_URL: postgresUrl,
    /** Connection string for the owner role (diary_owner). Only used by migrations. */
    DATABASE_MIGRATION_URL: postgresUrl.optional(),
    MIGRATIONS_DIR: z.string().default("src/server/db/migrations"),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

    // Registration and login codes
    REGISTRATION_ENABLED: booleanFlag(true),
    /** Comma-separated list. Empty means any domain is accepted. */
    ALLOWED_EMAIL_DOMAINS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((domain) => domain.trim().toLowerCase())
          .filter((domain) => domain.length > 0),
      ),
    /** Secret key for HMAC-SHA256 of login codes. At least 32 characters. */
    CODE_HMAC_SECRET: z.string().min(32, "must be at least 32 characters"),
    CODE_TTL_MINUTES: z.coerce.number().int().positive().default(10),
    CODE_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    CODE_REQUESTS_PER_15_MIN: z.coerce.number().int().positive().default(3),

    // Sessions
    SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
    SESSION_IDLE_DAYS: z.coerce.number().int().positive().default(7),

    // Per-IP rate limit for the authentication endpoints
    AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),

    // Mail
    /** "resend" in production; "console" prints codes to the log (development only). */
    MAIL_PROVIDER: z.enum(["resend", "console"]).optional(),
    MAIL_FROM: z.string().default("Diario <no-reply@localhost>"),
    MAIL_REPLY_TO: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
  })
  .superRefine((config, context) => {
    const provider =
      config.MAIL_PROVIDER ?? (config.NODE_ENV === "production" ? "resend" : "console");

    if (provider === "resend" && !config.RESEND_API_KEY) {
      context.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "is required when MAIL_PROVIDER is resend",
      });
    }
    if (provider === "console" && config.NODE_ENV === "production") {
      context.addIssue({
        code: "custom",
        path: ["MAIL_PROVIDER"],
        message: "console mail provider is not allowed in production",
      });
    }
  });

export type RawAppConfig = z.infer<typeof envSchema>;

export interface AppConfig extends Omit<RawAppConfig, "MAIL_PROVIDER"> {
  /** Resolved mail provider (defaults depend on NODE_ENV). */
  MAIL_PROVIDER: "resend" | "console";
}

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

  const data = parsed.data;
  return {
    ...data,
    MAIL_PROVIDER: data.MAIL_PROVIDER ?? (data.NODE_ENV === "production" ? "resend" : "console"),
  };
}

/** Returns the migration connection string or fails with a clear message. */
export function requireMigrationUrl(config: AppConfig): string {
  if (!config.DATABASE_MIGRATION_URL) {
    throw new Error("DATABASE_MIGRATION_URL (or DATABASE_MIGRATION_URL_FILE) is required");
  }
  return config.DATABASE_MIGRATION_URL;
}
