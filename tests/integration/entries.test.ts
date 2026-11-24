import type { LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseClient } from "../../src/server/db/client.js";
import type { EntryView, TagView } from "../../src/shared/entries.js";
import { createTestApp, type TestApp } from "../helpers/test-app.js";
import { openOwnerDatabase, resetDatabase } from "../helpers/test-database.js";
import { signInToken, withSession } from "../helpers/auth-helpers.js";
import { todayIn } from "../../src/shared/time.js";

const MISSING = "00000000-0000-4000-8000-000000000000";

describe("diary entries, days, calendar and tags", () => {
  let test: TestApp;
  let owner: DatabaseClient;
  let aliceToken: string;
  let bobToken: string;
  let adminToken: string;

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
    aliceToken = await signInToken(test, "alice@example.com");
    bobToken = await signInToken(test, "bob@example.com");
    adminToken = await signInToken(test, "boss@example.com");
    await owner.pool.query(
      "UPDATE users SET timezone = 'Europe/Madrid' WHERE email = 'alice@example.com'",
    );
    await owner.pool.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT u.id, r.id FROM users u, roles r
       WHERE u.email = 'boss@example.com' AND r.name = 'admin'`,
    );
  });

  async function call(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    url: string,
    token: string,
    payload?: Record<string, unknown>,
  ): Promise<LightMyRequestResponse> {
    return test.app.inject(
      payload === undefined
        ? { method, url, headers: withSession(token) }
        : { method, url, payload, headers: withSession(token) },
    );
  }

  async function createEntry(token: string, body: Record<string, unknown>): Promise<EntryView> {
    const response = await call("POST", "/api/entries", token, body);
    expect(response.statusCode).toBe(201);
    return response.json<{ entry: EntryView }>().entry;
  }

  it("creates an entry with date, minute-precision time, title, content and tags", async () => {
    const entry = await createEntry(aliceToken, {
      entryDate: "2026-11-23",
      entryTime: "09:05",
      title: "Morning",
      content: "# Hello",
      tags: ["Travel", " travel ", "work"],
    });

    expect(entry).toMatchObject({
      entryDate: "2026-11-23",
      entryTime: "09:05",
      title: "Morning",
      content: "# Hello",
      tags: ["travel", "work"],
    });
  });

  it("defaults the date and time to now in the user's timezone", async () => {
    const before = new Date();
    const entry = await createEntry(aliceToken, { content: "quick note" });

    expect(entry.entryDate).toBe(todayIn("Europe/Madrid", before));
    expect(entry.entryTime).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    expect(entry.title).toBeNull();
    expect(entry.tags).toEqual([]);
  });

  it("rejects an invalid time, seconds, or date", async () => {
    for (const body of [
      { entryTime: "25:00" },
      { entryTime: "09:05:30" },
      { entryTime: "9:05" },
      { entryDate: "2026-02-30" },
    ]) {
      const response = await call("POST", "/api/entries", aliceToken, body);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    }
  });

  it("returns a day's entries ordered by time", async () => {
    await createEntry(aliceToken, { entryDate: "2026-11-23", entryTime: "18:30" });
    await createEntry(aliceToken, { entryDate: "2026-11-23", entryTime: "07:15" });
    await createEntry(aliceToken, { entryDate: "2026-11-24", entryTime: "08:00" });

    const response = await call("GET", "/api/days/2026-11-23", aliceToken);

    expect(response.statusCode).toBe(200);
    const times = response.json<{ entries: EntryView[] }>().entries.map((entry) => entry.entryTime);
    expect(times).toEqual(["07:15", "18:30"]);
  });

  it("lists entries in a date range and validates the range", async () => {
    await createEntry(aliceToken, { entryDate: "2026-11-01", entryTime: "10:00" });
    await createEntry(aliceToken, { entryDate: "2026-11-30", entryTime: "10:00" });
    await createEntry(aliceToken, { entryDate: "2026-12-01", entryTime: "10:00" });

    const response = await call("GET", "/api/entries?from=2026-11-01&to=2026-11-30", aliceToken);
    expect(response.json<{ entries: EntryView[] }>().entries).toHaveLength(2);

    const reversed = await call("GET", "/api/entries?from=2026-11-30&to=2026-11-01", aliceToken);
    expect(reversed.statusCode).toBe(400);

    const tooLong = await call("GET", "/api/entries?from=2020-01-01&to=2026-01-01", aliceToken);
    expect(tooLong.statusCode).toBe(400);
  });

  it("counts entries per day for a calendar month", async () => {
    await createEntry(aliceToken, { entryDate: "2026-11-05", entryTime: "08:00" });
    await createEntry(aliceToken, { entryDate: "2026-11-05", entryTime: "20:00" });
    await createEntry(aliceToken, { entryDate: "2026-11-20", entryTime: "09:00" });
    await createEntry(aliceToken, { entryDate: "2026-12-01", entryTime: "09:00" });

    const response = await call("GET", "/api/calendar?month=2026-11", aliceToken);

    expect(response.json<{ days: { date: string; count: number }[] }>().days).toEqual([
      { date: "2026-11-05", count: 2 },
      { date: "2026-11-20", count: 1 },
    ]);
  });

  it("updates time, date, title and tags; an empty tag list removes them", async () => {
    const entry = await createEntry(aliceToken, {
      entryDate: "2026-11-23",
      entryTime: "09:00",
      tags: ["a", "b"],
    });

    const moved = await call("PATCH", `/api/entries/${entry.id}`, aliceToken, {
      entryDate: "2026-11-24",
      entryTime: "21:45",
      title: "",
      tags: [],
    });

    expect(moved.statusCode).toBe(200);
    expect(moved.json<{ entry: EntryView }>().entry).toMatchObject({
      entryDate: "2026-11-24",
      entryTime: "21:45",
      title: null,
      tags: [],
    });
  });

  it("deletes an entry and then reports it as not found", async () => {
    const entry = await createEntry(aliceToken, { entryDate: "2026-11-23", entryTime: "09:00" });

    const removed = await call("DELETE", `/api/entries/${entry.id}`, aliceToken);
    expect(removed.statusCode).toBe(204);

    const again = await call("GET", `/api/entries/${entry.id}`, aliceToken);
    expect(again.statusCode).toBe(404);
  });

  it("never exposes another user's entries, even by id", async () => {
    const entry = await createEntry(aliceToken, {
      entryDate: "2026-11-23",
      entryTime: "09:00",
      content: "secret",
    });

    const read = await call("GET", `/api/entries/${entry.id}`, bobToken);
    const patched = await call("PATCH", `/api/entries/${entry.id}`, bobToken, {
      content: "hacked",
    });
    const deleted = await call("DELETE", `/api/entries/${entry.id}`, bobToken);
    const day = await call("GET", "/api/days/2026-11-23", bobToken);

    expect(read.statusCode).toBe(404);
    expect(patched.statusCode).toBe(404);
    expect(deleted.statusCode).toBe(404);
    expect(day.json<{ entries: EntryView[] }>().entries).toEqual([]);

    const stillThere = await call("GET", `/api/entries/${entry.id}`, aliceToken);
    expect(stillThere.json<{ entry: EntryView }>().entry.content).toBe("secret");
  });

  it("forbids administrators, who have no access to diary content", async () => {
    // Give the administrator account only the admin role, without the user role.
    await owner.pool.query(
      `DELETE FROM user_roles WHERE user_id = (SELECT id FROM users WHERE email = 'boss@example.com')
        AND role_id = (SELECT id FROM roles WHERE name = 'user')`,
    );

    const response = await call("GET", "/api/days/2026-11-23", adminToken);

    expect(response.statusCode).toBe(403);
  });

  it("requires a session", async () => {
    const response = await test.app.inject({
      method: "GET",
      url: "/api/entries?from=2026-01-01&to=2026-01-02",
    });

    expect(response.statusCode).toBe(401);
  });

  it("lists tags with their usage count and renames them", async () => {
    await createEntry(aliceToken, { entryDate: "2026-11-23", entryTime: "09:00", tags: ["work"] });
    await createEntry(aliceToken, {
      entryDate: "2026-11-24",
      entryTime: "09:00",
      tags: ["work", "family"],
    });

    const list = await call("GET", "/api/tags", aliceToken);
    const tags = list.json<{ tags: TagView[] }>().tags;
    expect(tags.map((tag) => [tag.name, tag.entryCount])).toEqual([
      ["family", 1],
      ["work", 2],
    ]);

    const family = tags.find((tag) => tag.name === "family");
    const renamed = await call("PUT", `/api/tags/${String(family?.id ?? 0)}`, aliceToken, {
      name: "home",
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json<{ tag: TagView }>().tag).toMatchObject({ name: "home", entryCount: 1 });
  });

  it("refuses to rename a tag onto an existing name", async () => {
    await createEntry(aliceToken, {
      entryDate: "2026-11-23",
      entryTime: "09:00",
      tags: ["a", "b"],
    });
    const tags = (await call("GET", "/api/tags", aliceToken)).json<{ tags: TagView[] }>().tags;

    const response = await call("PUT", `/api/tags/${String(tags[0]?.id ?? 0)}`, aliceToken, {
      name: "b",
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "TAG_EXISTS" } });
  });

  it("deleting a tag removes it from entries but keeps the entries", async () => {
    const entry = await createEntry(aliceToken, {
      entryDate: "2026-11-23",
      entryTime: "09:00",
      tags: ["temp"],
    });
    const [tag] = (await call("GET", "/api/tags", aliceToken)).json<{ tags: TagView[] }>().tags;

    const removed = await call("DELETE", `/api/tags/${String(tag?.id ?? 0)}`, aliceToken);
    expect(removed.statusCode).toBe(204);

    const after = await call("GET", `/api/entries/${entry.id}`, aliceToken);
    expect(after.json<{ entry: EntryView }>().entry.tags).toEqual([]);
  });

  it("does not let a user rename or delete another user's tag", async () => {
    await createEntry(aliceToken, { entryDate: "2026-11-23", entryTime: "09:00", tags: ["mine"] });
    const [tag] = (await call("GET", "/api/tags", aliceToken)).json<{ tags: TagView[] }>().tags;

    const renamed = await call("PUT", `/api/tags/${String(tag?.id ?? 0)}`, bobToken, {
      name: "stolen",
    });
    const deleted = await call("DELETE", `/api/tags/${String(tag?.id ?? 0)}`, bobToken);

    expect(renamed.statusCode).toBe(404);
    expect(deleted.statusCode).toBe(404);
  });

  it("updates the profile timezone and display name, and rejects invalid timezones", async () => {
    const updated = await call("PATCH", "/api/account", bobToken, {
      displayName: "Bob B.",
      timezone: "America/New_York",
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<{ user: { displayName: string; timezone: string } }>().user).toMatchObject({
      displayName: "Bob B.",
      timezone: "America/New_York",
    });

    const invalid = await call("PATCH", "/api/account", bobToken, { timezone: "Mars/Olympus" });
    expect(invalid.statusCode).toBe(400);
  });

  it("returns 404 for an unknown tag id and for a malformed entry id", async () => {
    const tag = await call("PUT", "/api/tags/999999", aliceToken, { name: "x" });
    const entry = await call("GET", "/api/entries/not-a-uuid", aliceToken);
    const missing = await call("GET", `/api/entries/${MISSING}`, aliceToken);

    expect(tag.statusCode).toBe(404);
    expect(entry.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
  });
});
