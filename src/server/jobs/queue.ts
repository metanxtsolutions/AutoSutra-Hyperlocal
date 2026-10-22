/**
 * Postgres-backed job queue.
 *
 * Jobs are claimed with SELECT ... FOR UPDATE SKIP LOCKED, so several workers
 * (or overlapping cron invocations) never run the same job twice. Failed jobs
 * retry with exponential backoff; after max_attempts they are marked dead and
 * surfaced in the admin console. A job's idempotency key makes enqueueing the
 * same logical work twice a no-op.
 */
import { randomUUID } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "../db/client";
import { jobs } from "../db/schema";
import { ProviderError } from "../providers/types";

export type Job = typeof jobs.$inferSelect;

/** Throw from a handler when retrying cannot help (for example a rejected email address). */
export class PermanentJobError extends Error {}

export async function enqueue(
  db: DbOrTx,
  type: string,
  payload: Record<string, unknown>,
  opts: { idempotencyKey?: string; runAt?: Date; maxAttempts?: number } = {},
): Promise<{ created: boolean }> {
  const rows = await db
    .insert(jobs)
    .values({ type, payload, idempotencyKey: opts.idempotencyKey ?? null, runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? 5 })
    .onConflictDoNothing({ target: jobs.idempotencyKey })
    .returning({ id: jobs.id });
  return { created: rows.length > 0 };
}

export async function claimNext(db: DbOrTx, workerId: string): Promise<Job | null> {
  const res = await db.execute<Record<string, unknown>>(sql`
    UPDATE jobs SET status = 'running', locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1, updated_at = now()
    WHERE id = (
      SELECT id FROM jobs WHERE status = 'queued' AND run_at <= now()
      ORDER BY run_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING id`);
  const id = res.rows[0]?.id as string | undefined;
  if (!id) return null;
  return (await db.query.jobs.findFirst({ where: eq(jobs.id, id) })) ?? null;
}

export function backoffMs(attempt: number): number {
  return Math.min(30_000 * 2 ** (attempt - 1), 3_600_000);
}

export async function complete(db: DbOrTx, job: Job) {
  await db.update(jobs).set({ status: "succeeded", lockedAt: null, lastError: null }).where(eq(jobs.id, job.id));
}

export async function fail(db: DbOrTx, job: Job, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const retryable = !(error instanceof PermanentJobError) && (!(error instanceof ProviderError) || error.retryable);
  const dead = !retryable || job.attempts >= job.maxAttempts;
  await db
    .update(jobs)
    .set({
      status: dead ? (retryable ? "dead" : "failed") : "queued",
      runAt: dead ? job.runAt : new Date(Date.now() + backoffMs(job.attempts)),
      lockedAt: null,
      lockedBy: null,
      lastError: message.slice(0, 2000),
    })
    .where(eq(jobs.id, job.id));
  return { dead, retryable };
}

/** Requeue jobs whose worker died mid-run. */
export async function recoverStale(db: DbOrTx, olderThanMinutes = 15) {
  await db
    .update(jobs)
    .set({ status: "queued", lockedAt: null, lockedBy: null, lastError: "Recovered after worker timeout" })
    .where(and(eq(jobs.status, "running"), lt(jobs.lockedAt, new Date(Date.now() - olderThanMinutes * 60_000))));
}

export type Handler = (db: Database, job: Job) => Promise<void>;

export interface RunResult {
  processed: number;
  succeeded: number;
  failed: number;
}

export async function runJobs(db: Database, handlers: Record<string, Handler>, opts: { maxJobs?: number; timeBudgetMs?: number; workerId?: string } = {}): Promise<RunResult> {
  const workerId = opts.workerId ?? `worker-${randomUUID().slice(0, 8)}`;
  const deadline = Date.now() + (opts.timeBudgetMs ?? 50_000);
  const result: RunResult = { processed: 0, succeeded: 0, failed: 0 };
  await recoverStale(db);
  while (result.processed < (opts.maxJobs ?? 50) && Date.now() < deadline) {
    const job = await claimNext(db, workerId);
    if (!job) break;
    result.processed++;
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`No handler for job type ${job.type}`);
      await handler(db, job);
      await complete(db, job);
      result.succeeded++;
    } catch (e) {
      result.failed++;
      const outcome = await fail(db, job, e);
      console.error(JSON.stringify({ level: "error", msg: "job_failed", jobId: job.id, type: job.type, attempt: job.attempts, dead: outcome.dead, error: e instanceof Error ? e.message : String(e) }));
    }
  }
  return result;
}
