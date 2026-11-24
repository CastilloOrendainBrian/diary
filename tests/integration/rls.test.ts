import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabaseClient, type DatabaseClient } from "../../src/server/db/client.js";
import { withUserContext } from "../../src/server/db/rls.js";
import { entries, entryTags, tags } from "../../src/server/db/schema.js";
import { TEST_APP_URL } from "../helpers/database-urls.js";
import { openOwnerDatabase, resetDatabase } from "../helpers/test-database.js";

/** Raised by PostgreSQL when a row violates a policy (wrapped by Drizzle, so matched by message). */
const RLS_VIOLATION_MESSAGE = "row-level security policy";

describe("row level security on diary tables (runtime role)", () => {
  let owner: DatabaseClient;
  let runtime: DatabaseClient;
  let alice: string;
  let bob: string;

  beforeAll(() => {
    owner = openOwnerDatabase();
    runtime = createDatabaseClient(TEST_APP_URL, 2);
  });

  afterAll(async () => {
    await runtime.close();
    await owner.close();
  });

  beforeEach(async () => {
    await resetDatabase(owner);
    alice = await insertUser(owner, "alice@example.com");
    bob = await insertUser(owner, "bob@example.com");
    await withUserContext(runtime.db, alice, (tx) =>
      tx
        .insert(entries)
        .values({ userId: alice, entryDate: "2026-01-01", entryTime: "09:00", content: "alice" }),
    );
    await withUserContext(runtime.db, bob, (tx) =>
      tx
        .insert(entries)
        .values({ userId: bob, entryDate: "2026-01-01", entryTime: "10:00", content: "bob" }),
    );
  });

  it("shows each user only their own entries", async () => {
    const seen = await withUserContext(runtime.db, alice, (tx) =>
      tx.select({ userId: entries.userId, content: entries.content }).from(entries),
    );

    expect(seen).toEqual([{ userId: alice, content: "alice" }]);
  });

  it("shows nothing when no user context is set", async () => {
    const seen = await runtime.db.select().from(entries);

    expect(seen).toEqual([]);
  });

  it("does not let a user insert an entry for another user", async () => {
    await expectRlsViolation(
      withUserContext(runtime.db, alice, (tx) =>
        tx.insert(entries).values({ userId: bob, entryDate: "2026-01-02", entryTime: "08:00" }),
      ),
    );
  });

  it("silently ignores updates and deletes of another user's entries", async () => {
    await withUserContext(runtime.db, alice, async (tx) => {
      await tx.update(entries).set({ content: "hacked" });
      await tx.delete(entries);
    });

    const result = await owner.pool.query<{ content: string }>(
      "SELECT content FROM entries WHERE user_id = $1",
      [bob],
    );
    expect(result.rows).toEqual([{ content: "bob" }]);
  });

  it("isolates tags per user", async () => {
    await withUserContext(runtime.db, alice, (tx) =>
      tx.insert(tags).values({ userId: alice, name: "travel" }),
    );

    const seenByBob = await withUserContext(runtime.db, bob, (tx) => tx.select().from(tags));
    expect(seenByBob).toEqual([]);
  });

  it("does not let a user tag another user's entry", async () => {
    const [bobEntry] = await withUserContext(runtime.db, bob, (tx) =>
      tx.select({ id: entries.id }).from(entries),
    );
    const [aliceTag] = await withUserContext(runtime.db, alice, (tx) =>
      tx.insert(tags).values({ userId: alice, name: "mine" }).returning({ id: tags.id }),
    );

    await expectRlsViolation(
      withUserContext(runtime.db, alice, (tx) =>
        tx.insert(entryTags).values({ entryId: bobEntry?.id ?? "", tagId: aliceTag?.id ?? 0 }),
      ),
    );
  });

  it("does not leak the user context to the next request on the same connection", async () => {
    await withUserContext(runtime.db, alice, () => Promise.resolve());

    const afterwards = await runtime.db.select().from(entries);
    expect(afterwards).toEqual([]);
  });
});

/** Drizzle wraps driver errors; the policy message is on the underlying cause. */
async function expectRlsViolation(promise: Promise<unknown>): Promise<void> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  const cause = (error as { cause?: { message?: string } } | null)?.cause?.message ?? "";
  expect(cause).toContain(RLS_VIOLATION_MESSAGE);
}

async function insertUser(owner: DatabaseClient, email: string): Promise<string> {
  const result = await owner.pool.query<{ id: string }>(
    "INSERT INTO users (email, display_name) VALUES ($1, 'Test') RETURNING id",
    [email],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("insert returned no id");
  return id;
}
