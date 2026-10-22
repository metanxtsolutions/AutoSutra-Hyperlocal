import type { Database } from "../db/client";
import { enqueue, runJobs, type RunResult } from "./queue";
import { handlers } from "./handlers";

/** Process queued jobs with every registered handler. */
export function runAllHandlers(db: Database, opts: { maxJobs?: number; timeBudgetMs?: number } = {}): Promise<RunResult> {
  return runJobs(db, handlers, opts);
}

/**
 * Enqueue periodic work. Idempotency keys are bucketed by time, so calling
 * this often (from the worker and from cron) never double-schedules.
 */
export async function runScheduled(db: Database) {
  const now = Date.now();
  const quarter = Math.floor(now / (15 * 60_000));
  const hour = Math.floor(now / 3_600_000);
  const day = new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10);
  await enqueue(db, "schedule_sync", {}, { idempotencyKey: `schedule_sync:${quarter}` });
  if ("automation_scan" in handlers) await enqueue(db, "automation_scan", {}, { idempotencyKey: `automation:${hour}` });
  if ("reconcile" in handlers) await enqueue(db, "reconcile", {}, { idempotencyKey: `reconcile:${day}` });
  if ("billing_cycle" in handlers) await enqueue(db, "billing_cycle", {}, { idempotencyKey: `billing:${day}` });
}
