/**
 * Reporting.
 *
 * Rules
 * - Provider metrics are reported per provider with their attribution notes,
 *   never blended. Totals across providers are shown only for additive
 *   measures (spend, impressions, clicks) and are labelled as such.
 * - Reach is not additive across days or providers, so only daily reach is
 *   stored and no total reach is shown.
 * - Funnel stages come from AutoSutra lead records and are labelled by how
 *   they are known: captured, qualified, test drive, booking, sale (as marked
 *   by dealership staff).
 * - Cost per lead uses provider-reported spend divided by AutoSutra-captured
 *   leads for the same filters and dates; the methodology is shown.
 * - Only live, provider-reported data is used. Demo publications contribute nothing.
 */
import { and, eq, gte, inArray, isNull, lte, ne, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { campaignBudgets, campaignPlatforms, campaigns, leads, locations, metricSnapshots } from "../db/schema";
import { locationScope, requireOrg, type Actor } from "../auth/context";
import { todayIST } from "@/lib/format";

export interface ReportFilter {
  from: string;
  to: string;
  dealershipId?: string;
  locationId?: string;
  campaignId?: string;
  provider?: "meta" | "google";
  objective?: string;
  brand?: string;
  model?: string;
  leadStatus?: string;
}

export function defaultRange(days = 30): { from: string; to: string } {
  const to = todayIST();
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}

export function normaliseFilter(raw: Record<string, string | undefined>): ReportFilter {
  const d = defaultRange();
  const valid = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  let from = valid(raw.from) ?? d.from;
  let to = valid(raw.to) ?? d.to;
  if (from > to) [from, to] = [to, from];
  return {
    from,
    to,
    dealershipId: uuid(raw.dealershipId),
    locationId: uuid(raw.locationId),
    campaignId: uuid(raw.campaignId),
    provider: raw.provider === "meta" || raw.provider === "google" ? raw.provider : undefined,
    objective: raw.objective || undefined,
    brand: raw.brand?.trim() || undefined,
    model: raw.model?.trim() || undefined,
    leadStatus: raw.leadStatus || undefined,
  };
}

function campaignConds(actor: Actor, orgId: string, f: ReportFilter): SQL[] {
  const c: SQL[] = [eq(campaigns.organisationId, orgId)];
  const scope = locationScope(actor, orgId);
  if (scope !== null) c.push(inArray(campaigns.primaryLocationId, scope.length ? scope : ["00000000-0000-0000-0000-000000000000"]));
  if (f.dealershipId) c.push(eq(campaigns.dealershipId, f.dealershipId));
  if (f.locationId) c.push(eq(campaigns.primaryLocationId, f.locationId));
  if (f.campaignId) c.push(eq(campaigns.id, f.campaignId));
  if (f.objective) c.push(eq(campaigns.objective, f.objective as (typeof campaigns.$inferSelect)["objective"]));
  if (f.brand) c.push(sql`${campaigns.brand} ILIKE ${f.brand}`);
  if (f.model) c.push(sql`${campaigns.model} ILIKE ${f.model}`);
  return c;
}

export async function buildReport(db: DbOrTx, actor: Actor, orgId: string, f: ReportFilter) {
  requireOrg(actor, orgId, "reports.view");
  const cc = campaignConds(actor, orgId, f);

  // Provider metrics per provider, location and day.
  const metricRows = await db
    .select({
      provider: metricSnapshots.provider,
      locationId: campaigns.primaryLocationId,
      locationName: locations.name,
      campaignId: campaigns.id,
      campaignName: campaigns.name,
      date: metricSnapshots.metricDate,
      impressions: sql<string>`coalesce(sum(${metricSnapshots.impressions}), 0)`,
      clicks: sql<string>`coalesce(sum(${metricSnapshots.clicks}), 0)`,
      spend: sql<string>`coalesce(sum(${metricSnapshots.spend}), 0)`,
      conversions: sql<string>`sum(${metricSnapshots.platformConversions})`,
    })
    .from(metricSnapshots)
    .innerJoin(campaignPlatforms, eq(campaignPlatforms.id, metricSnapshots.campaignPlatformId))
    .innerJoin(campaigns, eq(campaigns.id, campaignPlatforms.campaignId))
    .innerJoin(locations, eq(locations.id, campaigns.primaryLocationId))
    .where(and(...cc, gte(metricSnapshots.metricDate, f.from), lte(metricSnapshots.metricDate, f.to), f.provider ? eq(metricSnapshots.provider, f.provider) : undefined))
    .groupBy(metricSnapshots.provider, campaigns.primaryLocationId, locations.name, campaigns.id, campaigns.name, metricSnapshots.metricDate);
  const num = (v: string | null) => (v === null ? null : Number(v));
  const metrics = metricRows.map((r) => ({ ...r, impressions: Number(r.impressions), clicks: Number(r.clicks), spend: Number(r.spend), conversions: num(r.conversions) }));

  // Leads captured by AutoSutra (duplicates excluded).
  const leadConds: SQL[] = [eq(leads.organisationId, orgId), isNull(leads.duplicateOfId), gte(leads.createdAt, new Date(`${f.from}T00:00:00+05:30`)), lte(leads.createdAt, new Date(`${f.to}T23:59:59+05:30`)), ne(leads.status, "invalid")];
  const scope = locationScope(actor, orgId);
  if (scope !== null) leadConds.push(inArray(leads.locationId, scope.length ? scope : ["00000000-0000-0000-0000-000000000000"]));
  if (f.locationId) leadConds.push(eq(leads.locationId, f.locationId));
  if (f.dealershipId) leadConds.push(eq(leads.dealershipId, f.dealershipId));
  if (f.campaignId) leadConds.push(eq(leads.campaignId, f.campaignId));
  if (f.provider) leadConds.push(eq(leads.provider, f.provider));
  if (f.model) leadConds.push(sql`${leads.vehicleModel} ILIKE ${f.model}`);
  if (f.brand) leadConds.push(sql`${leads.vehicleBrand} ILIKE ${f.brand}`);
  if (f.leadStatus) leadConds.push(eq(leads.status, f.leadStatus as (typeof leads.$inferSelect)["status"]));
  const leadRows = await db
    .select({
      locationId: leads.locationId,
      provider: leads.provider,
      source: leads.source,
      total: sql<number>`count(*)`,
      qualified: sql<number>`count(*) filter (where ${leads.status} in ('qualified','test_drive_scheduled','test_drive_completed','booking','sold'))`,
      testDrives: sql<number>`count(*) filter (where ${leads.status} in ('test_drive_completed','booking','sold'))`,
      bookings: sql<number>`count(*) filter (where ${leads.status} in ('booking','sold'))`,
      sales: sql<number>`count(*) filter (where ${leads.status} = 'sold')`,
      responded: sql<number>`count(${leads.firstResponseAt})`,
      avgResponseMinutes: sql<number>`avg(extract(epoch from (${leads.firstResponseAt} - ${leads.createdAt})) / 60)`,
    })
    .from(leads)
    .where(and(...leadConds))
    .groupBy(leads.locationId, leads.provider, leads.source);
  const L = leadRows.map((r) => ({ ...r, total: Number(r.total), qualified: Number(r.qualified), testDrives: Number(r.testDrives), bookings: Number(r.bookings), sales: Number(r.sales), responded: Number(r.responded), avgResponseMinutes: r.avgResponseMinutes === null ? null : Number(r.avgResponseMinutes) }));

  // Budgets (planned vs approved) for campaigns overlapping the period.
  const budgetRows = await db
    .select({ provider: campaignPlatforms.provider, planned: sql<string>`coalesce(sum(${campaignBudgets.lifetimeBudget}), 0)`, status: campaigns.status, reported: sql<string>`max(${campaignPlatforms.reportedSpend})` })
    .from(campaignBudgets)
    .innerJoin(campaignPlatforms, eq(campaignPlatforms.id, campaignBudgets.campaignPlatformId))
    .innerJoin(campaigns, eq(campaigns.id, campaignBudgets.campaignId))
    .where(and(...cc, lte(campaigns.startDate, f.to), gte(campaigns.endDate, f.from), f.provider ? eq(campaignPlatforms.provider, f.provider) : undefined))
    .groupBy(campaignPlatforms.provider, campaigns.status);
  const approvedStatuses = ["ready_to_publish", "publishing", "active", "partially_published", "paused", "completed", "pending_funding"];
  const planned = budgetRows.reduce((s, r) => s + Number(r.planned), 0);
  const approved = budgetRows.filter((r) => approvedStatuses.includes(r.status)).reduce((s, r) => s + Number(r.planned), 0);

  // Freshness of provider data.
  const freshness = await db
    .select({ provider: campaignPlatforms.provider, lastSynced: sql<Date | null>`max(${campaignPlatforms.lastSyncedAt})`, platforms: sql<number>`count(*)`, syncErrors: sql<number>`count(${campaignPlatforms.lastSyncError})` })
    .from(campaignPlatforms)
    .innerJoin(campaigns, eq(campaigns.id, campaignPlatforms.campaignId))
    .where(and(...cc, eq(campaignPlatforms.mode, "live")))
    .groupBy(campaignPlatforms.provider);

  const byProvider = (["meta", "google"] as const).map((p) => {
    const m = metrics.filter((x) => x.provider === p);
    const impressions = m.reduce((s, x) => s + x.impressions, 0);
    const clicks = m.reduce((s, x) => s + x.clicks, 0);
    const spend = m.reduce((s, x) => s + x.spend, 0);
    const conv = m.some((x) => x.conversions !== null) ? m.reduce((s, x) => s + (x.conversions ?? 0), 0) : null;
    const providerLeads = L.filter((l) => l.provider === p).reduce((s, l) => s + l.total, 0);
    const fr = freshness.find((x) => x.provider === p);
    return {
      provider: p,
      impressions,
      clicks,
      ctr: impressions ? clicks / impressions : null,
      spend,
      platformConversions: conv,
      attributedLeads: providerLeads,
      costPerLead: providerLeads ? Math.round(spend / providerLeads) : null,
      lastSynced: fr?.lastSynced ? new Date(fr.lastSynced) : null,
      livePlatforms: Number(fr?.platforms ?? 0),
      syncErrors: Number(fr?.syncErrors ?? 0),
      hasData: m.length > 0,
    };
  });

  const locIds = Array.from(new Set([...metrics.map((m) => m.locationId), ...L.map((l) => l.locationId).filter(Boolean) as string[]]));
  const locNames = locIds.length ? await db.select({ id: locations.id, name: locations.name }).from(locations).where(inArray(locations.id, locIds)) : [];
  const byLocation = locIds.map((id) => {
    const m = metrics.filter((x) => x.locationId === id);
    const l = L.filter((x) => x.locationId === id);
    const spend = m.reduce((s, x) => s + x.spend, 0);
    const total = l.reduce((s, x) => s + x.total, 0);
    const testDrives = l.reduce((s, x) => s + x.testDrives, 0);
    return {
      locationId: id,
      name: locNames.find((n) => n.id === id)?.name ?? "Unknown",
      spend,
      impressions: m.reduce((s, x) => s + x.impressions, 0),
      clicks: m.reduce((s, x) => s + x.clicks, 0),
      leads: total,
      qualified: l.reduce((s, x) => s + x.qualified, 0),
      testDrives,
      bookings: l.reduce((s, x) => s + x.bookings, 0),
      sales: l.reduce((s, x) => s + x.sales, 0),
      costPerLead: total ? Math.round(spend / total) : null,
      costPerTestDrive: testDrives ? Math.round(spend / testDrives) : null,
    };
  }).sort((a, b) => b.spend - a.spend || b.leads - a.leads);

  const days = new Map<string, { date: string; meta: number; google: number; leads: number }>();
  for (let t = Date.parse(`${f.from}T00:00:00Z`); t <= Date.parse(`${f.to}T00:00:00Z`); t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    days.set(d, { date: d, meta: 0, google: 0, leads: 0 });
  }
  for (const m of metrics) {
    const d = days.get(m.date);
    if (d) d[m.provider] += m.spend;
  }
  const dailyLeads = await db
    .select({ day: sql<string>`to_char(${leads.createdAt} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`, n: sql<number>`count(*)` })
    .from(leads)
    .where(and(...leadConds))
    .groupBy(sql`1`);
  for (const r of dailyLeads) {
    const d = days.get(r.day);
    if (d) d.leads = Number(r.n);
  }

  const totals = {
    spend: byProvider.reduce((s, p) => s + p.spend, 0),
    impressions: byProvider.reduce((s, p) => s + p.impressions, 0),
    clicks: byProvider.reduce((s, p) => s + p.clicks, 0),
    leads: L.reduce((s, l) => s + l.total, 0),
    qualified: L.reduce((s, l) => s + l.qualified, 0),
    testDrives: L.reduce((s, l) => s + l.testDrives, 0),
    bookings: L.reduce((s, l) => s + l.bookings, 0),
    sales: L.reduce((s, l) => s + l.sales, 0),
    responded: L.reduce((s, l) => s + l.responded, 0),
    avgResponseMinutes: (() => {
      const w = L.filter((l) => l.avgResponseMinutes !== null && l.responded > 0);
      const n = w.reduce((s, l) => s + l.responded, 0);
      return n ? w.reduce((s, l) => s + (l.avgResponseMinutes ?? 0) * l.responded, 0) / n : null;
    })(),
    planned,
    approved,
  };
  const staleHours = 6;
  const warnings: string[] = [];
  for (const p of byProvider) {
    if (p.livePlatforms && (!p.lastSynced || Date.now() - p.lastSynced.getTime() > staleHours * 3600_000)) warnings.push(`${p.provider === "meta" ? "Meta" : "Google Ads"} data is more than ${staleHours} hours old.`);
    if (p.syncErrors) warnings.push(`${p.syncErrors} ${p.provider === "meta" ? "Meta" : "Google Ads"} campaign(s) failed to sync last time.`);
  }
  const bySource = Object.entries(L.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.source]: (acc[l.source] ?? 0) + l.total }), {})).map(([source, n]) => ({ source, leads: n }));
  return { filter: f, totals, byProvider, byLocation, bySource, daily: [...days.values()], warnings, campaigns: metrics };
}

export type Report = Awaited<ReturnType<typeof buildReport>>;
