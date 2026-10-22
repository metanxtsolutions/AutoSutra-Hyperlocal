import { sql } from "drizzle-orm";
import type { DbOrTx } from "./db/client";
import { RateLimitError } from "./errors";

/**
 * Sliding-window rate limiting stored in Postgres, so it holds across
 * serverless instances without extra infrastructure. The count is the current
 * window plus the previous window weighted by how much of it still overlaps,
 * which stops bursts at window boundaries.
 */
export async function rateLimit(db: DbOrTx, key: string, limit: number, windowSeconds: number): Promise<void> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const currentStart = new Date(now - (now % windowMs));
  const previousStart = new Date(currentStart.getTime() - windowMs);
  const result = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, ${currentStart.toISOString()}, 1)
    ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
    RETURNING count`);
  const current = Number(result.rows[0]?.count ?? 0);
  const prev = await db.execute<{ count: number }>(sql`SELECT count FROM rate_limits WHERE key = ${key} AND window_start = ${previousStart.toISOString()}`);
  const previous = Number(prev.rows[0]?.count ?? 0);
  const overlap = 1 - (now - currentStart.getTime()) / windowMs;
  if (current + previous * overlap > limit) {
    throw new RateLimitError("Too many attempts. Please wait a few minutes and try again.");
  }
}

export async function pruneRateLimits(db: DbOrTx): Promise<void> {
  await db.execute(sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`);
}
