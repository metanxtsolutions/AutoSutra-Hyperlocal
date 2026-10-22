import { and, eq, gte, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { leads, metricSnapshots, organisations } from "../db/schema";
import { formatINR } from "@/lib/money";
import { notify } from "./notifications";

/** A short, source-labelled weekly summary per organisation, delivered as a notification. */
export async function buildWeeklySummaries(db: Database, today: string) {
  const since = new Date(Date.parse(`${today}T00:00:00+05:30`) - 7 * 86_400_000);
  const sinceDate = since.toISOString().slice(0, 10);
  const orgs = await db.select().from(organisations).where(eq(organisations.status, "active"));
  let sent = 0;
  for (const o of orgs) {
    const [m] = await db
      .select({ spend: sql<string>`coalesce(sum(${metricSnapshots.spend}), 0)`, clicks: sql<string>`coalesce(sum(${metricSnapshots.clicks}), 0)` })
      .from(metricSnapshots)
      .where(and(eq(metricSnapshots.organisationId, o.id), gte(metricSnapshots.metricDate, sinceDate)));
    const [l] = await db
      .select({ n: sql<number>`count(*)`, sold: sql<number>`count(*) filter (where ${leads.status} = 'sold')` })
      .from(leads)
      .where(and(eq(leads.organisationId, o.id), gte(leads.createdAt, since), isNull(leads.duplicateOfId)));
    if (Number(m.spend) === 0 && Number(l.n) === 0) continue;
    if (
      await notify(db, {
        organisationId: o.id,
        kind: "weekly_summary",
        title: "Your week in AutoSutra",
        body: `Last 7 days: ${formatINR(Number(m.spend), { decimals: false })} provider-reported spend, ${Number(m.clicks)} clicks, ${Number(l.n)} enquiries captured, ${Number(l.sold)} marked sold by your team.`,
        link: "/app/reports",
        dedupeKey: `weekly:${o.id}:${today}`,
      })
    )
      sent++;
  }
  return sent;
}
