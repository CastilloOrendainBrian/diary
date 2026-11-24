import { sql } from "drizzle-orm";
import type { Database, Transaction } from "./client.js";

/**
 * Runs `work` in a transaction in which the row-level security policies see `userId`.
 * The setting is transaction-local, so it never leaks into the next request that reuses
 * the same pooled connection.
 */
export function withUserContext<T>(
  db: Database,
  userId: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return work(tx);
  });
}
