/**
 * Long-running worker: `npm run worker`.
 * Processes queued jobs and schedules periodic work. On serverless hosting,
 * /api/cron/run-jobs does the same work in short bursts instead.
 */
import { closeDb, getDb } from "../db/client";
import { runScheduled, runAllHandlers } from "./run";

let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

async function main() {
  const db = getDb();
  console.log(JSON.stringify({ level: "info", msg: "worker_started" }));
  let lastSchedule = 0;
  while (!stopping) {
    if (Date.now() - lastSchedule > 60_000) {
      await runScheduled(db).catch((e) => console.error(JSON.stringify({ level: "error", msg: "schedule_failed", error: String(e) })));
      lastSchedule = Date.now();
    }
    const r = await runAllHandlers(db, { maxJobs: 25, timeBudgetMs: 25_000 });
    if (r.processed === 0) await new Promise((res) => setTimeout(res, 3_000));
  }
  await closeDb();
  console.log(JSON.stringify({ level: "info", msg: "worker_stopped" }));
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
