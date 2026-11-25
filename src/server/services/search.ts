import { and, desc, eq, sql } from "drizzle-orm";
import { HIGHLIGHT_END, HIGHLIGHT_START, type SearchHit } from "../../shared/search.js";
import { toMinutePrecision } from "../../shared/time.js";
import type { DbExecutor } from "../db/client.js";
import { entries } from "../db/schema.js";

/**
 * Full-text search over the user's entries (Spanish configuration, see search_vector).
 * Runs inside withUserContext(), so row level security limits it to the caller's notes.
 */
export async function searchEntries(
  db: DbExecutor,
  userId: string,
  query: string,
  limit: number,
): Promise<SearchHit[]> {
  const tsQuery = sql`websearch_to_tsquery('spanish', ${query})`;
  // ts_headline returns plain text with our markers; the browser renders it as text, never as HTML.
  const snippet = sql<string>`ts_headline('spanish', ${entries.content}, ${tsQuery}, ${`StartSel=${HIGHLIGHT_START}, StopSel=${HIGHLIGHT_END}, MaxFragments=2, MinWords=5, MaxWords=18, FragmentDelimiter=" … "`})`;
  const rank = sql<number>`ts_rank(${entries.searchVector}, ${tsQuery})`;

  const rows = await db
    .select({
      id: entries.id,
      entryDate: entries.entryDate,
      entryTime: entries.entryTime,
      title: entries.title,
      snippet,
    })
    .from(entries)
    .where(and(eq(entries.userId, userId), sql`${entries.searchVector} @@ ${tsQuery}`))
    .orderBy(desc(rank), desc(entries.entryDate), desc(entries.entryTime))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    entryTime: toMinutePrecision(row.entryTime),
  }));
}
