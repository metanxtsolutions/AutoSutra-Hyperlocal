import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "../../db/client";
import { campaignBudgets, campaignPlatforms, campaigns, dealerships, locations, organisations } from "../../db/schema";
import { locationScope, requireOrg, requirePlatform, type Actor } from "../../auth/context";

export * from "./load";
export * from "./drafts";
export * from "./workflow";
export { checkReadiness, type Finding, type Readiness } from "./readiness";
export { configSnapshot, hashSnapshot } from "./snapshot";

export interface CampaignFilter {
  status?: string;
  dealershipId?: string;
  locationId?: string;
  objective?: string;
  q?: string;
}

const summaryFields = {
  campaign: campaigns,
  dealershipName: dealerships.name,
  locationName: locations.name,
  budget: sql<string>`coalesce((select sum(${campaignBudgets.lifetimeBudget}) from ${campaignBudgets} where ${campaignBudgets.campaignId} = ${campaigns.id}), 0)`,
  platforms: sql<string[]>`coalesce((select array_agg(${campaignPlatforms.provider}::text || ':' || ${campaignPlatforms.status}::text order by ${campaignPlatforms.provider}) from ${campaignPlatforms} where ${campaignPlatforms.campaignId} = ${campaigns.id}), '{}')`,
};

function filters(f: CampaignFilter): SQL[] {
  const c: SQL[] = [];
  if (f.status) c.push(eq(campaigns.status, f.status as (typeof campaigns.$inferSelect)["status"]));
  if (f.dealershipId) c.push(eq(campaigns.dealershipId, f.dealershipId));
  if (f.locationId) c.push(eq(campaigns.primaryLocationId, f.locationId));
  if (f.objective) c.push(eq(campaigns.objective, f.objective as (typeof campaigns.$inferSelect)["objective"]));
  if (f.q) c.push(sql`${campaigns.name} ILIKE ${"%" + f.q + "%"}`);
  return c;
}

export async function listCampaigns(db: DbOrTx, actor: Actor, organisationId: string, f: CampaignFilter = {}) {
  requireOrg(actor, organisationId, "campaign.view");
  const scope = locationScope(actor, organisationId);
  const rows = await db
    .select(summaryFields)
    .from(campaigns)
    .innerJoin(dealerships, eq(dealerships.id, campaigns.dealershipId))
    .innerJoin(locations, eq(locations.id, campaigns.primaryLocationId))
    .where(
      and(
        eq(campaigns.organisationId, organisationId),
        scope === null ? undefined : inArray(campaigns.primaryLocationId, scope.length ? scope : ["00000000-0000-0000-0000-000000000000"]),
        ...filters(f),
      ),
    )
    .orderBy(desc(campaigns.updatedAt))
    .limit(500);
  return rows.map((r) => ({ ...r, budget: Number(r.budget) }));
}

/** All organisations' campaigns, for AutoSutra operations. */
export async function listAllCampaigns(db: DbOrTx, actor: Actor, f: CampaignFilter & { managedOnly?: boolean } = {}) {
  requirePlatform(actor, "platform.view_all");
  const rows = await db
    .select({ ...summaryFields, organisationName: organisations.name })
    .from(campaigns)
    .innerJoin(dealerships, eq(dealerships.id, campaigns.dealershipId))
    .innerJoin(locations, eq(locations.id, campaigns.primaryLocationId))
    .innerJoin(organisations, eq(organisations.id, campaigns.organisationId))
    .where(and(f.managedOnly ? eq(campaigns.managed, true) : undefined, ...filters(f)))
    .orderBy(desc(campaigns.updatedAt))
    .limit(500);
  return rows.map((r) => ({ ...r, budget: Number(r.budget) }));
}
