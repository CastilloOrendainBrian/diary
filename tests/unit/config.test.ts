import { describe, expect, it } from "vitest";
import { loadConfig, readSecretEnv, requireMigrationUrl } from "../../src/server/config.js";

const VALID_ENV = {
  DATABASE_URL: "postgres://diary_app:secret@127.0.0.1:5433/diary",
};

describe("loadConfig", () => {
  it("applies defaults for optional variables", () => {
    const config = loadConfig(VALID_ENV);

    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe("development");
    expect(config.DATABASE_POOL_MAX).toBe(10);
    expect(config.MIGRATIONS_DIR).toBe("src/server/db/migrations");
  });

  it("requires DATABASE_URL", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it("rejects a non-PostgreSQL connection string", () => {
    expect(() => loadConfig({ DATABASE_URL: "mysql://localhost/diary" })).toThrow(/postgres:\/\//);
  });

  it("rejects an invalid port with a readable error", () => {
    expect(() => loadConfig({ ...VALID_ENV, PORT: "not-a-number" })).toThrow(/PORT/);
  });

  it("reads DATABASE_URL from a *_FILE secret", () => {
    const config = loadConfig(
      { DATABASE_URL_FILE: "/run/secrets/pg_app_url" },
      () => "postgres://diary_app:from-file@db:5432/diary\n",
    );

    expect(config.DATABASE_URL).toBe("postgres://diary_app:from-file@db:5432/diary");
  });
});

describe("readSecretEnv", () => {
  it("prefers the *_FILE variant over the plain variable", () => {
    const value = readSecretEnv(
      { TOKEN: "plain", TOKEN_FILE: "/run/secrets/token" },
      "TOKEN",
      () => "from-file\n",
    );

    expect(value).toBe("from-file");
  });

  it("falls back to the plain variable and treats empty values as missing", () => {
    expect(readSecretEnv({ TOKEN: "plain" }, "TOKEN")).toBe("plain");
    expect(readSecretEnv({ TOKEN: "" }, "TOKEN")).toBeUndefined();
  });
});

describe("requireMigrationUrl", () => {
  it("fails when the migration connection string is not configured", () => {
    const config = loadConfig(VALID_ENV);

    expect(() => requireMigrationUrl(config)).toThrow(/DATABASE_MIGRATION_URL/);
  });
});
