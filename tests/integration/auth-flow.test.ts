import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../helpers/test-app.js";
import { openOwnerDatabase, resetDatabase } from "../helpers/test-database.js";
import type { DatabaseClient } from "../../src/server/db/client.js";
import {
  COOKIE_NAME,
  TEST_ORIGIN,
  requestCode,
  sessionCookie,
  signIn,
  verifyCode,
} from "../helpers/auth-helpers.js";

interface LoginBody {
  user: { email: string; displayName: string; timezone: string };
  permissions: string[];
  registered: boolean;
}

describe("passwordless sign-in and registration", () => {
  let test: TestApp;
  let owner: DatabaseClient;

  beforeAll(async () => {
    test = await createTestApp();
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

  it("sends a 6-digit code by email and answers 202", async () => {
    const response = await requestCode(test.app, "new.user@example.com");

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ status: "accepted" });
    await test.app.authCodes.waitForDeliveries();

    expect(test.mailer.messages).toHaveLength(1);
    expect(test.mailer.messages[0]?.to).toBe("new.user@example.com");
    expect(test.mailer.messages[0]?.code).toMatch(/^\d{6}$/);
  });

  it("registers a new account on the first successful verification", async () => {
    const response = await signIn(test, "ana@example.com", {
      displayName: "Ana",
      timezone: "Europe/Madrid",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      user: { email: "ana@example.com", displayName: "Ana", timezone: "Europe/Madrid" },
      registered: true,
    });
    const body = response.json<LoginBody>();
    expect(body.permissions).toContain("entries:read");
    expect(body.permissions).not.toContain("users:manage");
  });

  it("sets an HTTP-only, strict, path-wide session cookie", async () => {
    const response = await signIn(test, "cookie@example.com");

    const cookie = response.cookies.find((item) => item.name === COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Strict");
    expect(cookie?.path).toBe("/");
  });

  it("stores only the SHA-256 hash of the session token", async () => {
    const response = await signIn(test, "hash@example.com");
    const token = sessionCookie(response);
    expect(token).not.toBeNull();

    const expectedHash = createHash("sha256")
      .update(token ?? "")
      .digest();
    const result = await owner.pool.query<{ token_hash: Buffer }>(
      "SELECT token_hash FROM sessions",
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.token_hash.equals(expectedHash)).toBe(true);
    expect(result.rows[0]?.token_hash.toString("utf8")).not.toContain(token ?? "");
  });

  it("signs in an existing user without creating a second account", async () => {
    await signIn(test, "again@example.com", { displayName: "First" });
    const second = await signIn(test, "again@example.com", { displayName: "Changed" });

    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ registered: false, user: { displayName: "First" } });

    const count = await owner.pool.query<{ count: string }>("SELECT count(*) FROM users");
    expect(count.rows[0]?.count).toBe("1");
  });

  it("treats email addresses case-insensitively", async () => {
    await requestCode(test.app, "  Mixed.Case@Example.COM ");
    await test.app.authCodes.waitForDeliveries();

    expect(test.mailer.messages[0]?.to).toBe("mixed.case@example.com");

    const response = await verifyCode(test.app, {
      email: "MIXED.CASE@example.com",
      code: test.mailer.codeFor("mixed.case@example.com"),
    });
    expect(response.statusCode).toBe(200);
  });

  it("answers the same way for known and unknown addresses", async () => {
    await signIn(test, "known@example.com");

    const known = await requestCode(test.app, "known@example.com");
    const unknown = await requestCode(test.app, "unknown@example.com");

    expect(known.statusCode).toBe(unknown.statusCode);
    expect(known.json()).toEqual(unknown.json());
  });

  it("rejects a wrong code with INVALID_CODE", async () => {
    await requestCode(test.app, "wrong@example.com");
    await test.app.authCodes.waitForDeliveries();
    const real = test.mailer.codeFor("wrong@example.com");
    const wrong = real === "000000" ? "111111" : "000000";

    const response = await verifyCode(test.app, { email: "wrong@example.com", code: wrong });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_CODE" } });
  });

  it("burns the code after the maximum number of failed attempts", async () => {
    await requestCode(test.app, "attempts@example.com");
    await test.app.authCodes.waitForDeliveries();
    const real = test.mailer.codeFor("attempts@example.com");
    const wrong = real === "000000" ? "111111" : "000000";

    for (let attempt = 0; attempt < 5; attempt++) {
      const failed = await verifyCode(test.app, { email: "attempts@example.com", code: wrong });
      expect(failed.statusCode).toBe(401);
    }

    // Even the correct code no longer works once the limit is reached.
    const afterLimit = await verifyCode(test.app, { email: "attempts@example.com", code: real });
    expect(afterLimit.statusCode).toBe(401);
  });

  it("accepts a code only once", async () => {
    await signIn(test, "once@example.com");
    const code = test.mailer.codeFor("once@example.com");

    const replay = await verifyCode(test.app, { email: "once@example.com", code });

    expect(replay.statusCode).toBe(401);
    expect(replay.json()).toMatchObject({ error: { code: "INVALID_CODE" } });
  });

  it("rejects an expired code", async () => {
    await requestCode(test.app, "expired@example.com");
    await test.app.authCodes.waitForDeliveries();
    const code = test.mailer.codeFor("expired@example.com");
    await owner.pool.query(
      "UPDATE login_codes SET expires_at = now() - interval '1 minute' WHERE email = 'expired@example.com'",
    );

    const response = await verifyCode(test.app, { email: "expired@example.com", code });

    expect(response.statusCode).toBe(401);
  });

  it("uses only the most recent code when several were requested", async () => {
    await requestCode(test.app, "latest@example.com");
    await test.app.authCodes.waitForDeliveries();
    const older = test.mailer.codeFor("latest@example.com");

    await requestCode(test.app, "latest@example.com");
    await test.app.authCodes.waitForDeliveries();
    const newer = test.mailer.codeFor("latest@example.com");

    const olderResponse = await verifyCode(test.app, { email: "latest@example.com", code: older });
    expect(olderResponse.statusCode).toBe(401);

    const newerResponse = await verifyCode(test.app, { email: "latest@example.com", code: newer });
    expect(newerResponse.statusCode).toBe(200);
  });

  it("detects the timezone on first sign-in and keeps it afterwards", async () => {
    await signIn(test, "tz@example.com", { timezone: "Europe/Madrid" });
    const later = await signIn(test, "tz@example.com", { timezone: "Asia/Tokyo" });

    expect(later.json<LoginBody>().user.timezone).toBe("Europe/Madrid");
  });

  it("ignores an invalid timezone and falls back to UTC", async () => {
    const response = await signIn(test, "badtz@example.com", { timezone: "Mars/Olympus" });

    expect(response.json<LoginBody>().user.timezone).toBe("UTC");
  });

  it("defaults the display name to the email local part", async () => {
    const response = await signIn(test, "maria.lopez@example.com");

    expect(response.json<LoginBody>().user.displayName).toBe("maria.lopez");
  });

  it("validates request bodies", async () => {
    const missingEmail = await test.app.inject({
      method: "POST",
      url: "/api/auth/code",
      payload: {},
      headers: { origin: TEST_ORIGIN },
    });
    expect(missingEmail.statusCode).toBe(400);
    expect(missingEmail.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    const shortCode = await verifyCode(test.app, { email: "x@example.com", code: "12345" });
    expect(shortCode.statusCode).toBe(400);
    expect(shortCode.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});
