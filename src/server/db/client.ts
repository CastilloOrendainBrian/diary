import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseClient {
  readonly pool: pg.Pool;
  readonly db: Database;
  close(): Promise<void>;
}

/** Creates a connection pool and a Drizzle instance bound to the schema. */
export function createDatabaseClient(
  connectionString: string,
  maxConnections: number,
): DatabaseClient {
  const pool = new pg.Pool({
    connectionString,
    max: maxConnections,
    // Fail fast instead of waiting forever when the database is unreachable.
    connectionTimeoutMillis: 5_000,
  });

  // Idle clients can be terminated by the server (restart, network issue). Without a listener
  // the 'error' event is unhandled and crashes the process; the pool discards the client instead.
  pool.on("error", (error) => {
    console.error("Unexpected error on idle PostgreSQL client", error);
  });

  const db = drizzle(pool, { schema });

  return {
    pool,
    db,
    close: () => pool.end(),
  };
}
