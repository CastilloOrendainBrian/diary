import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../src/server/db/client.js";
import { createTestApp, type TestApp } from "../helpers/test-app.js";
import { openOwnerDatabase, resetDatabase } from "../helpers/test-database.js";
import {
  COOKIE_NAME,
  TEST_ORIGIN,
  requestCode,
  sessionCookie,
  signIn,
  signInToken,
  withSession,
} from "../helpers/auth-helpers.js";

describe("sessions, logout and account sessions", () => {
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

  it("returns 401 from /api/auth/me without a session", async () => {
    const response = await test.app.inject({ method: "GET", url: "/api/auth/me" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });

  it("returns the user and effective permissions for a valid session", async () => {
    const token = await signInToken(test, "me@example.com");

    const response = await test.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: withSession(token),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ user: { email: string }; permissions: string[] }>();
    expect(body.user.email).toBe("me@example.com");
    expect(body.permissions).toContain("entries:write");
    expect(body.permissions).toEqual([...body.permissions].sort());
  });

  it("revokes the session on logout and clears the cookie", async () => {
    const token = await signInToken(test, "logout@example.com");

    const logout = await test.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { ...withSession(token), origin: TEST_ORIGIN },
    });
    expect(logout.statusCode).toBe(204);
    const cleared = logout.cookies.find((item) => item.name === COOKIE_NAME);
    expect(cleared?.value).toBe("");

    const after = await test.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: withSession(token),
    });
    expect(after.statusCode).toBe(401);
  });

  it("rejects a session past its absolute expiry", async () => {
    const token = await signInToken(test, "expired-session@example.com");
    await owner.pool.query("UPDATE sessions SET expires_at = now() - interval '1 second'");

    const response = await test.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: withSession(token),
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects a session that has been idle for too long", async () => {
    const token = await signInToken(test, "idle@example.com");
    await owner.pool.query("UPDATE sessions SET last_seen_at = now() - interval '30 days'");

    const response = await test.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: withSession(token),
    });

    expect(response.statusCode).toBe(401);
  });

  it("stops a disabled account from using existing sessions and receiving codes", async () => {
    const token = await signInToken(test, "disabled@example.com");
    await owner.pool.query("UPDATE users SET status = 'disabled'");

    const me = await test.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: withSession(token),
    });
    expect(me.statusCode).toBe(401);

    test.mailer.clear();
    await requestCode(test.app, "disabled@example.com");
    await test.app.authCodes.waitForDeliveries();
    expect(test.mailer.messages).toHaveLength(0);
  });

  it("refuses verification with ACCOUNT_DISABLED when the account is disabled after the code was sent", async () => {
    await signInToken(test, "blocked@example.com");
    await requestCode(test.app, "blocked@example.com");
    await test.app.authCodes.waitForDeliveries();
    const code = test.mailer.codeFor("blocked@example.com");

    await owner.pool.query("UPDATE users SET status = 'disabled'");

    const response = await test.app.inject({
      method: "POST",
      url: "/api/auth/code/verify",
      payload: { email: "blocked@example.com", code },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "ACCOUNT_DISABLED" } });
  });

  it("lists the caller's sessions and marks the current one", async () => {
    const first = await signInToken(test, "devices@example.com");
    await signInToken(test, "devices@example.com");

    const response = await test.app.inject({
      method: "GET",
      url: "/api/account/sessions",
      headers: withSession(first),
    });

    expect(response.statusCode).toBe(200);
    const sessions = response.json<{ sessions: { id: string; current: boolean }[] }>().sessions;
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((session) => session.current)).toHaveLength(1);
  });

  it("revokes another session of the same user", async () => {
    const current = await signInToken(test, "revoke@example.com");
    const other = await signInToken(test, "revoke@example.com");

    const listing = await test.app.inject({
      method: "GET",
      url: "/api/account/sessions",
      headers: withSession(current),
    });
    const sessions = listing.json<{ sessions: { id: string; current: boolean }[] }>().sessions;
    const target = sessions.find((session) => !session.current);
    expect(target).toBeDefined();

    const revoke = await test.app.inject({
      method: "DELETE",
      url: `/api/account/sessions/${target?.id ?? ""}`,
      headers: { ...withSession(current), origin: TEST_ORIGIN },
    });
    expect(revoke.statusCode).toBe(204);

    const otherAfter = await test.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: withSession(other),
    });
    expect(otherAfter.statusCode).toBe(401);
  });

  it("cannot revoke a session that belongs to another user", async () => {
    const mine = await signInToken(test, "owner-a@example.com");
    const theirs = await signInToken(test, "owner-b@example.com");

    const listing = await test.app.inject({
      method: "GET",
      url: "/api/account/sessions",
      headers: withSession(theirs),
    });
    const theirId = listing.json<{ sessions: { id: string }[] }>().sessions[0]?.id ?? "";

    const response = await test.app.inject({
      method: "DELETE",
      url: `/api/account/sessions/${theirId}`,
      headers: { ...withSession(mine), origin: TEST_ORIGIN },
    });

    expect(response.statusCode).toBe(404);
    const stillValid = await test.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: withSession(theirs),
    });
    expect(stillValid.statusCode).toBe(200);
  });

  it("rejects malformed session ids", async () => {
    const token = await signInToken(test, "malformed@example.com");

    const response = await test.app.inject({
      method: "DELETE",
      url: "/api/account/sessions/not-a-hash",
      headers: { ...withSession(token), origin: TEST_ORIGIN },
    });

    expect(response.statusCode).toBe(400);
  });

  it("requires a session for account routes", async () => {
    const response = await test.app.inject({ method: "GET", url: "/api/account/sessions" });

    expect(response.statusCode).toBe(401);
  });

  it("issues a different session token on every sign-in", async () => {
    const first = await signIn(test, "tokens@example.com");
    await test.app.authCodes.waitForDeliveries();
    const second = await signIn(test, "tokens@example.com");

    expect(sessionCookie(first)).not.toBe(sessionCookie(second));
  });

  it("rejects state-changing API requests from a foreign origin", async () => {
    const response = await test.app.inject({
      method: "POST",
      url: "/api/auth/code",
      payload: { email: "csrf@example.com" },
      headers: { origin: "https://evil.example" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_ORIGIN" } });
  });

  it("allows state-changing requests from the public origin and read requests from anywhere", async () => {
    const write = await test.app.inject({
      method: "POST",
      url: "/api/auth/code",
      payload: { email: "origin-ok@example.com" },
      headers: { origin: TEST_ORIGIN },
    });
    expect(write.statusCode).toBe(202);

    const read = await test.app.inject({
      method: "GET",
      url: "/api/health",
      headers: { origin: "https://elsewhere.example" },
    });
    expect(read.statusCode).toBe(200);
  });
});
