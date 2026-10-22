import { sql } from "drizzle-orm";
import type { DbOrTx } from "./db/client";
import { RateLimitError } from "./errors";

/**
 * Fixed-window rate limiting stored in Postgres, so it holds across
 * serverless instances without extra infrastructure.
 */
export async function rateLimit(db: DbOrTx, key: string, limit: number, windowSeconds: number): Promise<void> {
  const now = Date.now();
  const windowStart = new Date(now - (now % (windowSeconds * 1000)));
  const result = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, ${windowStart.toISOString()}, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count`);
  const count = Number(result.rows[0]?.count ?? 0);
  if (count > limit) throw new RateLimitError("Too many attempts. Please wait a few minutes and try again.");
}

export async function pruneRateLimits(db: DbOrTx): Promise<void> {
  await db.execute(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`);
}
