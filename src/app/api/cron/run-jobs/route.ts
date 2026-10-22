import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { runAllHandlers, runScheduled } from "@/server/jobs/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(req: Request): boolean {
  const secret = getEnv().CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/** Vercel Cron entry point: schedules periodic work and processes jobs for up to ~50 seconds. */
export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const db = getDb();
  await runScheduled(db);
  const result = await runAllHandlers(db, { maxJobs: 100, timeBudgetMs: 45_000 });
  return NextResponse.json({ ok: true, ...result });
}
