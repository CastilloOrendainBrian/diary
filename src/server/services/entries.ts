import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type {
  CalendarDay,
  CreateEntryInput,
  EntryView,
  TagView,
  UpdateEntryInput,
} from "../../shared/entries.js";
import { nextMonthStart, toMinutePrecision } from "../../shared/time.js";
import type { DbExecutor } from "../db/client.js";
import { entries, entryTags, tags } from "../db/schema.js";
import { errors } from "../errors.js";

type EntryRow = typeof entries.$inferSelect;

export interface EntryDefaults {
  /** Today in the user's timezone, used when no date is given. */
  today: string;
  /** Current time in the user's timezone, used when no time is given. */
  now: string;
}

/**
 * Diary entries live in row-level-security scope: callers must run these functions inside
 * withUserContext(), so other users' rows are invisible even if a filter is forgotten.
 */
export async function listEntries(
  db: DbExecutor,
  userId: string,
  range: { from: string; to: string },
): Promise<EntryView[]> {
  const rows = await db
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.userId, userId),
        gte(entries.entryDate, range.from),
        lt(entries.entryDate, range.to),
      ),
    )
    .orderBy(asc(entries.entryDate), asc(entries.entryTime), asc(entries.createdAt));
  return attachTags(db, rows);
}

export async function getEntry(
  db: DbExecutor,
  userId: string,
  entryId: string,
): Promise<EntryView> {
  const rows = await db
    .select()
    .from(entries)
    .where(and(eq(entries.id, entryId), eq(entries.userId, userId)))
    .limit(1);
  const [row] = await attachTags(db, rows);
  if (!row) throw errors.notFound("Entry");
  return row;
}

export async function createEntry(
  db: DbExecutor,
  userId: string,
  input: CreateEntryInput,
  defaults: EntryDefaults,
): Promise<EntryView> {
  const [created] = await db
    .insert(entries)
    .values({
      userId,
      entryDate: input.entryDate ?? defaults.today,
      entryTime: input.entryTime ?? defaults.now,
      title: normalizeTitle(input.title),
      content: input.content ?? "",
    })
    .returning();
  if (!created) throw new Error("Entry insert returned no row");

  await replaceEntryTags(db, userId, created.id, input.tags ?? []);
  return getEntry(db, userId, created.id);
}

export async function updateEntry(
  db: DbExecutor,
  userId: string,
  entryId: string,
  patch: UpdateEntryInput,
): Promise<EntryView> {
  const existing = await getEntry(db, userId, entryId);

  await db
    .update(entries)
    .set({
      entryDate: patch.entryDate ?? existing.entryDate,
      entryTime: patch.entryTime ?? existing.entryTime,
      title: patch.title !== undefined ? normalizeTitle(patch.title) : existing.title,
      content: patch.content ?? existing.content,
      updatedAt: new Date(),
    })
    .where(and(eq(entries.id, entryId), eq(entries.userId, userId)));

  if (patch.tags !== undefined) {
    await replaceEntryTags(db, userId, entryId, patch.tags);
  }
  return getEntry(db, userId, entryId);
}

export async function deleteEntry(db: DbExecutor, userId: string, entryId: string): Promise<void> {
  const deleted = await db
    .delete(entries)
    .where(and(eq(entries.id, entryId), eq(entries.userId, userId)))
    .returning({ id: entries.id });
  if (deleted.length === 0) throw errors.notFound("Entry");
}

/** Days of a month that contain at least one entry, with the number of entries per day. */
export async function calendarMonth(
  db: DbExecutor,
  userId: string,
  month: string,
): Promise<CalendarDay[]> {
  const start = `${month}-01`;
  const end = nextMonthStart(month);
  return db
    .select({
      date: entries.entryDate,
      count: sql<number>`count(*)::int`,
    })
    .from(entries)
    .where(
      and(eq(entries.userId, userId), gte(entries.entryDate, start), lt(entries.entryDate, end)),
    )
    .groupBy(entries.entryDate)
    .orderBy(asc(entries.entryDate));
}

export async function listTags(db: DbExecutor, userId: string): Promise<TagView[]> {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      entryCount: sql<number>`count(${entryTags.entryId})::int`,
    })
    .from(tags)
    .leftJoin(entryTags, eq(entryTags.tagId, tags.id))
    .where(eq(tags.userId, userId))
    .groupBy(tags.id, tags.name)
    .orderBy(asc(tags.name));
}

export async function renameTag(
  db: DbExecutor,
  userId: string,
  tagId: number,
  name: string,
): Promise<TagView> {
  try {
    const rows = await db
      .update(tags)
      .set({ name })
      .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
      .returning({ id: tags.id });
    if (rows.length === 0) throw errors.notFound("Tag");
  } catch (error) {
    if (isUniqueViolation(error)) throw errors.tagExists();
    throw error;
  }

  const [tag] = (await listTags(db, userId)).filter((item) => item.id === tagId);
  if (!tag) throw errors.notFound("Tag");
  return tag;
}

export async function deleteTag(db: DbExecutor, userId: string, tagId: number): Promise<void> {
  const deleted = await db
    .delete(tags)
    .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
    .returning({ id: tags.id });
  if (deleted.length === 0) throw errors.notFound("Tag");
}

/** Maps rows to views and loads their tags with one extra query. */
async function attachTags(db: DbExecutor, rows: EntryRow[]): Promise<EntryView[]> {
  if (rows.length === 0) return [];

  const links = await db
    .select({ entryId: entryTags.entryId, name: tags.name })
    .from(entryTags)
    .innerJoin(tags, eq(tags.id, entryTags.tagId))
    .where(
      inArray(
        entryTags.entryId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(tags.name));

  const tagsByEntry = new Map<string, string[]>();
  for (const link of links) {
    const list = tagsByEntry.get(link.entryId) ?? [];
    list.push(link.name);
    tagsByEntry.set(link.entryId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    entryDate: row.entryDate,
    entryTime: toMinutePrecision(row.entryTime),
    title: row.title,
    content: row.content,
    tags: tagsByEntry.get(row.id) ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/** Replaces the tags of an entry, creating missing tags for the user. */
async function replaceEntryTags(
  db: DbExecutor,
  userId: string,
  entryId: string,
  names: readonly string[],
): Promise<void> {
  const unique = [...new Set(names)];

  await db.delete(entryTags).where(eq(entryTags.entryId, entryId));
  if (unique.length === 0) return;

  await db
    .insert(tags)
    .values(unique.map((name) => ({ userId, name })))
    .onConflictDoNothing({ target: [tags.userId, tags.name] });

  const ids = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, userId), inArray(tags.name, unique)));

  await db
    .insert(entryTags)
    .values(ids.map((tag) => ({ entryId, tagId: tag.id })))
    .onConflictDoNothing();
}

function normalizeTitle(title: string | null | undefined): string | null {
  if (title === undefined || title === null) return null;
  return title.length > 0 ? title : null;
}

/** Unique violations come wrapped by Drizzle; the PostgreSQL code is on the cause. */
export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  const causeCode = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return code === "23505" || causeCode === "23505";
}
