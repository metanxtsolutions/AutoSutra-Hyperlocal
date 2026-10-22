import { createHash } from "node:crypto";
import type { FullCampaign } from "./load";

/**
 * The exact configuration a person approves. Any change to these fields after
 * approval changes the hash, and publishing refuses to run on a mismatch.
 */
export function configSnapshot(full: FullCampaign) {
  const c = full.campaign;
  const cr = full.creative;
  return {
    campaignId: c.id,
    version: c.version,
    name: c.name,
    objective: c.objective,
    dealershipId: c.dealershipId,
    primaryLocationId: c.primaryLocationId,
    schedule: { start: c.startDate, end: c.endDate },
    product: {
      brand: c.brand, model: c.model, variant: c.variant, vehicleCategory: c.vehicleCategory,
      offerHeadline: c.offerHeadline, offerDetails: c.offerDetails, startingPrice: c.startingPrice,
      priceVerified: c.priceVerified, financeDetails: c.financeDetails, financeApproved: c.financeApproved,
      bookingUrl: c.bookingUrl, disclaimer: c.disclaimer, claimsStatus: c.claimsStatus,
    },
    audience: { ageMin: c.ageMin, ageMax: c.ageMax, languages: [...c.languages].sort(), placements: c.placements, keywords: [...c.keywords].sort() },
    budget: { maxAuthorisedSpend: c.maxAuthorisedSpend, alertThresholdPct: c.alertThresholdPct },
    targeting: full.targets
      .map(({ targeting: t }) => ({ locationId: t.locationId, radiusKm: t.radiusKm, include: [...t.includePincodes].sort(), exclude: [...t.excludePincodes].sort() }))
      .sort((a, b) => a.locationId.localeCompare(b.locationId)),
    platforms: full.platforms
      .map(({ platform: p }) => ({
        provider: p.provider,
        campaignType: p.providerCampaignType,
        providerAccountId: p.providerAccountId,
        budgets: full.budgets
          .filter((b) => b.campaignPlatformId === p.id)
          .map((b) => ({ locationId: b.locationId, lifetime: b.lifetimeBudget, daily: b.dailyBudget }))
          .sort((a, b) => a.locationId.localeCompare(b.locationId)),
      }))
      .sort((a, b) => a.provider.localeCompare(b.provider)),
    creative: cr
      ? {
          headline: cr.headline, headlines: cr.headlines, primaryText: cr.primaryText, description: cr.description,
          descriptions: cr.descriptions, callToAction: cr.callToAction, landingUrl: cr.landingUrl,
          metaLeadFormId: cr.metaLeadFormId, whatsappNumber: cr.whatsappNumber, phoneNumber: cr.phoneNumber,
          assetIds: [...cr.assetIds].sort(),
        }
      : null,
  };
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.keys(value as object).sort().map((k) => [k, stable((value as Record<string, unknown>)[k])]));
  }
  return value;
}

export function hashSnapshot(snapshot: unknown): string {
  return createHash("sha256").update(JSON.stringify(stable(snapshot))).digest("hex");
}
