import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../src/server/db/client.js";
import { createTestApp, type TestApp } from "../helpers/test-app.js";
import { openOwnerDatabase, resetDatabase } from "../helpers/test-database.js";
import { requestCode, signIn, verifyCode } from "../helpers/auth-helpers.js";

describe("registration policy and abuse limits", () => {
  let test: TestApp;
  let owner: DatabaseClient;

  beforeAll(async () => {
    test = await createTestApp({ CODE_REQUESTS_PER_15_MIN: "3" });
    owner = openOwnerDatabase();
  });

  afterAll(async () => {
    await test.close();
    await owner.close();
  });

  beforeEach(async () => {
    await resetDatabase(owner);
    test.mailer.clear();
  });

  it("stops sending codes to an address after the per-email limit", async () => {
    for (let i = 0; i < 4; i++) {
      const response = await requestCode(test.app, "spam@example.com");
      expect(response.statusCode).toBe(202);
    }
    await test.app.authCodes.waitForDeliveries();

    expect(test.mailer.messages).toHaveLength(3);
    const audit = await owner.pool.query<{ count: string }>(
      "SELECT count(*) FROM audit_log WHERE action = 'auth.code.rate_limited'",
    );
    expect(audit.rows[0]?.count).toBe("1");
  });

  it("does not send codes or create accounts when registration is closed", async () => {
    const closed = await createTestApp({ REGISTRATION_ENABLED: "false" });
    try {
      await resetDatabase(owner);
      const response = await requestCode(closed.app, "newcomer@example.com");
      expect(response.statusCode).toBe(202);
      await closed.app.authCodes.waitForDeliveries();

      expect(closed.mailer.messages).toHaveLength(0);
      const users = await owner.pool.query<{ count: string }>("SELECT count(*) FROM users");
      expect(users.rows[0]?.count).toBe("0");
    } finally {
      await closed.close();
    }
  });

  it("still signs in existing users when registration is closed", async () => {
    await signIn(test, "existing@example.com");

    const closed = await createTestApp({ REGISTRATION_ENABLED: "false" });
    try {
      await closed.app.authCodes.waitForDeliveries();
      await requestCode(closed.app, "existing@example.com");
      await closed.app.authCodes.waitForDeliveries();
      const code = closed.mailer.codeFor("existing@example.com");

      const response = await verifyCode(closed.app, { email: "existing@example.com", code });
      expect(response.statusCode).toBe(200);
    } finally {
      await closed.close();
    }
  });

  it("only sends codes to allowed email domains when a list is configured", async () => {
    const restricted = await createTestApp({
      ALLOWED_EMAIL_DOMAINS: "example.org, Team.Example.com",
    });
    try {
      await resetDatabase(owner);

      await requestCode(restricted.app, "outsider@example.com");
      await requestCode(restricted.app, "insider@team.example.com");
      await restricted.app.authCodes.waitForDeliveries();

      expect(restricted.mailer.messages.map((message) => message.to)).toEqual([
        "insider@team.example.com",
      ]);
    } finally {
      await restricted.close();
    }
  });

  it("does not send a code to a disabled account", async () => {
    await signIn(test, "suspended@example.com");
    await owner.pool.query("UPDATE users SET status = 'disabled'");
    test.mailer.clear();

    await requestCode(test.app, "suspended@example.com");
    await test.app.authCodes.waitForDeliveries();

    expect(test.mailer.messages).toHaveLength(0);
    const audit = await owner.pool.query<{ count: string }>(
      "SELECT count(*) FROM audit_log WHERE action = 'auth.code.refused'",
    );
    expect(audit.rows[0]?.count).toBe("1");
  });

  it("answers 202 even when the email provider fails, and records the failure", async () => {
    test.mailer.failWith = "provider unavailable";

    const response = await requestCode(test.app, "flaky@example.com");
    expect(response.statusCode).toBe(202);
    await test.app.authCodes.waitForDeliveries();

    const audit = await owner.pool.query<{ action: string; metadata: { error: string } }>(
      "SELECT action, metadata FROM audit_log WHERE action = 'auth.code.send_failed'",
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.metadata.error).toBe("provider unavailable");
  });

  it("never writes the plain code to the audit log", async () => {
    await signIn(test, "audit-clean@example.com");
    const code = test.mailer.codeFor("audit-clean@example.com");

    const rows = await owner.pool.query<{ metadata: unknown }>("SELECT metadata FROM audit_log");
    expect(JSON.stringify(rows.rows)).not.toContain(code);
  });
});

describe("per-IP rate limit on authentication endpoints", () => {
  it("returns 429 after the configured number of requests per minute", async () => {
    const limited = await createTestApp({ AUTH_RATE_LIMIT_PER_MINUTE: "2" });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 3; i++) {
        const response = await requestCode(limited.app, `ip-${String(i)}@example.com`);
        statuses.push(response.statusCode);
      }

      expect(statuses).toEqual([202, 202, 429]);
    } finally {
      await limited.close();
    }
  });
});
