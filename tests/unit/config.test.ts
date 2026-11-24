import { describe, expect, it } from "vitest";
import { loadConfig, readSecretEnv, requireMigrationUrl } from "../../src/server/config.js";

const SECRET = "a-secret-that-is-definitely-longer-than-32-chars";

const BASE_ENV = {
  DATABASE_URL: "postgres://diary_app:secret@127.0.0.1:5433/diary",
  CODE_HMAC_SECRET: SECRET,
};

describe("loadConfig", () => {
  it("applies defaults for optional variables", () => {
    const config = loadConfig(BASE_ENV);

    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe("development");
    expect(config.REGISTRATION_ENABLED).toBe(true);
    expect(config.ALLOWED_EMAIL_DOMAINS).toEqual([]);
    expect(config.CODE_TTL_MINUTES).toBe(10);
    expect(config.CODE_MAX_ATTEMPTS).toBe(5);
    expect(config.CODE_REQUESTS_PER_15_MIN).toBe(3);
    expect(config.SESSION_TTL_DAYS).toBe(30);
    expect(config.SESSION_IDLE_DAYS).toBe(7);
    expect(config.PUBLIC_URL).toBe("http://localhost:5173");
  });

  it("uses the console mail provider in development and resend in production", () => {
    expect(loadConfig(BASE_ENV).MAIL_PROVIDER).toBe("console");
    expect(
      loadConfig({ ...BASE_ENV, NODE_ENV: "production", RESEND_API_KEY: "re_test_key" })
        .MAIL_PROVIDER,
    ).toBe("resend");
  });

  it("requires DATABASE_URL", () => {
    expect(() => loadConfig({ CODE_HMAC_SECRET: SECRET })).toThrow(/DATABASE_URL/);
  });

  it("rejects a non-PostgreSQL connection string", () => {
    expect(() => loadConfig({ ...BASE_ENV, DATABASE_URL: "mysql://localhost/diary" })).toThrow(
      /postgres:\/\//,
    );
  });

  it("requires a long enough HMAC secret", () => {
    expect(() => loadConfig({ ...BASE_ENV, CODE_HMAC_SECRET: "short" })).toThrow(
      /CODE_HMAC_SECRET/,
    );
  });

  it("requires RESEND_API_KEY when the resend provider is selected", () => {
    expect(() => loadConfig({ ...BASE_ENV, MAIL_PROVIDER: "resend" })).toThrow(/RESEND_API_KEY/);
  });

  it("refuses the console mail provider in production", () => {
    expect(() =>
      loadConfig({ ...BASE_ENV, NODE_ENV: "production", MAIL_PROVIDER: "console" }),
    ).toThrow(/not allowed in production/);
  });

  it("parses the registration flag and the domain allow-list", () => {
    const config = loadConfig({
      ...BASE_ENV,
      REGISTRATION_ENABLED: "false",
      ALLOWED_EMAIL_DOMAINS: " Example.org, team.example.com ,",
    });

    expect(config.REGISTRATION_ENABLED).toBe(false);
    expect(config.ALLOWED_EMAIL_DOMAINS).toEqual(["example.org", "team.example.com"]);
  });

  it("rejects an invalid boolean flag", () => {
    expect(() => loadConfig({ ...BASE_ENV, REGISTRATION_ENABLED: "yes" })).toThrow(
      /REGISTRATION_ENABLED/,
    );
  });

  it("rejects an invalid port with a readable error", () => {
    expect(() => loadConfig({ ...BASE_ENV, PORT: "not-a-number" })).toThrow(/PORT/);
  });

  it("reads secrets from *_FILE variants", () => {
    const config = loadConfig(
      {
        DATABASE_URL_FILE: "/run/secrets/pg_app_url",
        CODE_HMAC_SECRET_FILE: "/run/secrets/code_hmac_secret",
      },
      (path) =>
        path.endsWith("pg_app_url")
          ? "postgres://diary_app:from-file@db:5432/diary\n"
          : `${SECRET}\n`,
    );

    expect(config.DATABASE_URL).toBe("postgres://diary_app:from-file@db:5432/diary");
    expect(config.CODE_HMAC_SECRET).toBe(SECRET);
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
    expect(() => requireMigrationUrl(loadConfig(BASE_ENV))).toThrow(/DATABASE_MIGRATION_URL/);
  });
});
