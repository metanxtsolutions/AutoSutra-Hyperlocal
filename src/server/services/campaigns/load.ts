import { asc, desc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "../../db/client";
import {
  campaignApprovals,
  campaignBudgets,
  campaignCreatives,
  campaignPlatforms,
  campaignTargeting,
  campaigns,
  creativeAssets,
  dealerships,
  locations,
  organisations,
  providerAccounts,
} from "../../db/schema";
import { locationScope, requireOrg, type Actor } from "../../auth/context";
import type { OrgPermission } from "../../auth/permissions";
import { NotFoundError } from "../../errors";

export type Campaign = typeof campaigns.$inferSelect;
export type Platform = typeof campaignPlatforms.$inferSelect;
export type Budget = typeof campaignBudgets.$inferSelect;
export type Creative = typeof campaignCreatives.$inferSelect;
export type Location = typeof locations.$inferSelect;

export interface FullCampaign {
  campaign: Campaign;
  organisation: typeof organisations.$inferSelect;
  dealership: typeof dealerships.$inferSelect;
  primaryLocation: Location;
  targets: { targeting: typeof campaignTargeting.$inferSelect; location: Location }[];
  platforms: { platform: Platform; account: typeof providerAccounts.$inferSelect | null }[];
  budgets: Budget[];
  creative: Creative | null;
  assets: (typeof creativeAssets.$inferSelect)[];
  approvals: (typeof campaignApprovals.$inferSelect)[];
}

export async function loadCampaign(db: DbOrTx, id: string): Promise<FullCampaign | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.id, id) });
  if (!campaign) return null;
  const [organisation, dealership, primaryLocation, targets, platforms, budgets, creative, approvals] = await Promise.all([
    db.query.organisations.findFirst({ where: eq(organisations.id, campaign.organisationId) }),
    db.query.dealerships.findFirst({ where: eq(dealerships.id, campaign.dealershipId) }),
    db.query.locations.findFirst({ where: eq(locations.id, campaign.primaryLocationId) }),
    db
      .select({ targeting: campaignTargeting, location: locations })
      .from(campaignTargeting)
      .innerJoin(locations, eq(locations.id, campaignTargeting.locationId))
      .where(eq(campaignTargeting.campaignId, id))
      .orderBy(asc(locations.name)),
    db
      .select({ platform: campaignPlatforms, account: providerAccounts })
      .from(campaignPlatforms)
      .leftJoin(providerAccounts, eq(providerAccounts.id, campaignPlatforms.providerAccountId))
      .where(eq(campaignPlatforms.campaignId, id))
      .orderBy(asc(campaignPlatforms.provider)),
    db.select().from(campaignBudgets).where(eq(campaignBudgets.campaignId, id)),
    db.query.campaignCreatives.findFirst({ where: eq(campaignCreatives.campaignId, id) }),
    db.select().from(campaignApprovals).where(eq(campaignApprovals.campaignId, id)).orderBy(desc(campaignApprovals.createdAt)),
  ]);
  if (!organisation || !dealership || !primaryLocation) return null;
  const assets = creative?.assetIds.length
    ? await db.select().from(creativeAssets).where(inArray(creativeAssets.id, creative.assetIds))
    : [];
  return { campaign, organisation, dealership, primaryLocation, targets, platforms, budgets, creative: creative ?? null, assets, approvals };
}

/** Load a campaign the actor may access with `permission`, enforcing tenant and location scope. */
export async function getCampaign(db: DbOrTx, actor: Actor, id: string, permission: OrgPermission = "campaign.view"): Promise<FullCampaign> {
  const full = await loadCampaign(db, id);
  if (!full) throw new NotFoundError("Campaign not found");
  requireOrg(actor, full.campaign.organisationId, permission);
  const scope = locationScope(actor, full.campaign.organisationId);
  if (scope !== null) {
    const locs = new Set([full.campaign.primaryLocationId, ...full.targets.map((t) => t.location.id)]);
    if (![...locs].every((l) => scope.includes(l))) throw new NotFoundError("Campaign not found");
  }
  return full;
}

export function totalBudget(full: Pick<FullCampaign, "budgets">): number {
  return full.budgets.reduce((s, b) => s + b.lifetimeBudget, 0);
}

export function platformBudget(full: Pick<FullCampaign, "budgets">, platformId: string): number {
  return full.budgets.filter((b) => b.campaignPlatformId === platformId).reduce((s, b) => s + b.lifetimeBudget, 0);
}
