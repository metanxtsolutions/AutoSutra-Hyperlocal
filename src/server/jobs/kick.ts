import { after } from "next/server";

/**
 * Run queued jobs right after the current response is sent, so publishing and
 * emails do not wait for the next worker or cron cycle (Vercel's Hobby plan
 * only allows a daily cron). Outside a request (tests, scripts, the worker)
 * this does nothing and the worker or cron picks the jobs up as usual.
 */
export function processQueueSoon(): void {
  try {
    after(async () => {
      const [{ getDb }, { runAllHandlers }] = await Promise.all([import("../db/client"), import("./run")]);
      await runAllHandlers(getDb(), { maxJobs: 20, timeBudgetMs: 25_000 });
    });
  } catch {
    // Not inside a request.
  }
}
