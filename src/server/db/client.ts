import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "../env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
/** A database handle or an open transaction; services accept either. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

const globalForDb = globalThis as unknown as { __autosutraPool?: Pool; __autosutraDb?: Database };

export function getPool(): Pool {
  if (!globalForDb.__autosutraPool) {
    globalForDb.__autosutraPool = new Pool({ connectionString: getEnv().DATABASE_URL, max: 10 });
  }
  return globalForDb.__autosutraPool;
}

export function getDb(): Database {
  if (!globalForDb.__autosutraDb) {
    globalForDb.__autosutraDb = drizzle(getPool(), { schema });
  }
  return globalForDb.__autosutraDb;
}

export async function closeDb(): Promise<void> {
  await globalForDb.__autosutraPool?.end();
  globalForDb.__autosutraPool = undefined;
  globalForDb.__autosutraDb = undefined;
}

export { schema };
