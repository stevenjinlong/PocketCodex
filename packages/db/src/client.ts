import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import { schema, type PocketCodexSchema } from "./schema.js";

export type PocketCodexDatabase = NodePgDatabase<PocketCodexSchema>;

export interface DatabaseClient {
  db: PocketCodexDatabase;
  pool: Pool;
}

export function createDatabase(connectionString = process.env.DATABASE_URL): DatabaseClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create the Pocket Codex database client.");
  }

  const pool = new Pool({
    connectionString,
  });

  return {
    db: drizzle(pool, { schema }),
    pool,
  };
}

export function createDatabaseFromConfig(config: PoolConfig): DatabaseClient {
  const pool = new Pool(config);

  return {
    db: drizzle(pool, { schema }),
    pool,
  };
}
