/**
 * Hourly automation scan. Every alert has a dedupe key, so re-running the scan
 * never sends the same alert twice. Nothing here increases spend or changes a
 * campaign's configuration; the only automatic provider action in the product
 * is the authorised-spend safety pause in publishing.ts.
 */
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { advertisingConnections, campaignCreatives, campaignPlatforms, campaigns, organisations } from "../db/schema";
import { todayIST } from "@/lib/format";
import { checkConnection } from "./connections";
import { applyRetention } from "./leads";
import { notify } from "./notifications";
import { buildWeeklySummaries } from "./weekly-summary";

export async function runAutomationScan(db: Database, now = new Date()) {
  const today = todayIST();
  const out = { pendingApprovals: 0, missingTracking: 0, ended: 0, staleSync: 0, connections: 0, anonymised: 0, summaries: 0 };

  // Pending approvals waiting more than 24 hours.
  const waiting = await db.select().from(campaigns).where(and(eq(campaigns.status, "pending_approval"), lt(campaigns.submittedAt, new Date(now.getTime() - 24 * 3600_000))));
  for (const c of waiting) {
    if (await notify(db, { organisationId: c.organisationId, kind: "approval_overdue", severity: "warning", title: "Campaign still waiting for approval", body: `"${c.name}" has waited more than a day for approval.`, link: `/app/campaigns/${c.id}/review`, dedupeKey: `approval_overdue:${c.id}:${c.version}` })) out.pendingApprovals++;
    if (c.managed) await notify(db, { organisationId: null, audience: "platform", kind: "approval_overdue", title: "Managed campaign awaiting customer approval", body: c.name, link: `/admin/campaigns/${c.id}`, dedupeKey: `ops_approval_overdue:${c.id}:${c.version}` });
  }

  // Live campaigns whose landing URL carries no UTM tags: AutoSutra cannot attribute website leads.
  const live = await db
    .select({ c: campaigns, url: campaignCreatives.landingUrl })
    .from(campaigns)
    .innerJoin(campaignCreatives, eq(campaignCreatives.campaignId, campaigns.id))
    .where(inArray(campaigns.status, ["active", "partially_published", "publishing"]));
  for (const { c, url } of live) {
    if (url && !/[?&]utm_source=/.test(url)) {
      if (await notify(db, { organisationId: c.organisationId, kind: "missing_tracking", severity: "warning", title: "Campaign has no tracking parameters", body: `"${c.name}" sends visitors to a URL without UTM parameters, so website enquiries cannot be attributed to it. Add utm_source and utm_campaign to the landing URL for your next campaign.`, link: `/app/campaigns/${c.id}`, dedupeKey: `missing_tracking:${c.id}` })) out.missingTracking++;
    }
  }

  // Campaigns past their end date.
  const ended = await db.select().from(campaigns).where(and(inArray(campaigns.status, ["active", "paused", "partially_published", "demo_published"]), lt(campaigns.endDate, today)));
  for (const c of ended) {
    if (await notify(db, { organisationId: c.organisationId, kind: "campaign_ended", title: "Campaign end date reached", body: `"${c.name}" ended on ${c.endDate}. Review results and mark it completed to release any unspent budget.`, link: `/app/campaigns/${c.id}`, dedupeKey: `campaign_end_date:${c.id}` })) out.ended++;
  }

  // Live platforms not synced for six hours.
  const stale = await db
    .select({ p: campaignPlatforms, name: campaigns.name })
    .from(campaignPlatforms)
    .innerJoin(campaigns, eq(campaigns.id, campaignPlatforms.campaignId))
    .where(and(eq(campaignPlatforms.mode, "live"), isNotNull(campaignPlatforms.publishedAt), inArray(campaigns.status, ["active", "publishing", "partially_published"]), sql`coalesce(${campaignPlatforms.lastSyncedAt}, ${campaignPlatforms.publishedAt}) < ${new Date(now.getTime() - 6 * 3600_000).toISOString()}`));
  for (const { p, name } of stale) {
    if (await notify(db, { organisationId: null, audience: "platform", kind: "stale_sync", severity: "warning", title: "Provider data is stale", body: `${name} (${p.provider}) has not synced for over 6 hours. ${p.lastSyncError ?? ""}`, link: `/admin/campaigns/${p.campaignId}`, dedupeKey: `stale_sync:${p.id}:${today}` })) out.staleSync++;
  }

  // Daily connection health check.
  if (now.getUTCHours() === 3) {
    const conns = await db.select().from(advertisingConnections).where(inArray(advertisingConnections.status, ["connected", "access_pending"]));
    for (const c of conns) {
      const status = await checkConnection(db, c.id);
      out.connections++;
      if (status !== "connected") {
        await notify(db, { organisationId: c.organisationId, kind: "connection_problem", severity: "critical", title: `${c.provider === "meta" ? "Meta" : "Google Ads"} connection needs attention`, body: `Status: ${status.replace("_", " ")}. Reconnect to keep publishing and reporting.`, link: "/app/settings/connections", dedupeKey: `connection_problem:${c.organisationId}:${c.provider}:${today}` });
        await notify(db, { organisationId: null, audience: "platform", kind: "connection_problem", title: "Customer ad account disconnected", body: `${c.provider} connection status ${status}`, link: "/admin/connections", dedupeKey: `ops_connection:${c.id}:${today}` });
      }
    }
    out.anonymised = await applyRetention(db);
  }

  // Weekly performance summary on Monday mornings (IST).
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  if (ist.getUTCDay() === 1 && ist.getUTCHours() === 8) out.summaries = await buildWeeklySummaries(db, today);
  return out;
}

export async function activeOrganisationIds(db: Database) {
  return (await db.select({ id: organisations.id }).from(organisations).where(eq(organisations.status, "active"))).map((o) => o.id);
}
