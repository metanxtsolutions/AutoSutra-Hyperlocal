import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx, Tx } from "../../db/client";
import {
  campaignBudgets,
  campaignCreatives,
  campaignPlatforms,
  campaignTargeting,
  campaigns,
  creativeAssets,
  creativeTemplates,
  dealerships,
  locations,
  providerAccounts,
} from "../../db/schema";
import { audit } from "../../audit";
import { requireLocation, requireOrg, type Actor } from "../../auth/context";
import { CALL_TO_ACTIONS, OBJECTIVE_DEFS, objectiveDef, providerMapping, resolveCampaignType, type ObjectiveValue } from "@/lib/objectives";
import { MoneyError, parseOptionalRupees, parseRupees } from "@/lib/money";
import { ForbiddenError, NotFoundError, ValidationError } from "../../errors";
import { putObject, validateUpload } from "../../storage";
import { optionalHttpsUrl, optionalIndianPhone, optionalText, parse, pincodeList, requiredText } from "../../validation";
import { findOverlaps } from "../dealerships";
import { getCampaign, type FullCampaign } from "./load";

const OBJECTIVE_VALUES = OBJECTIVE_DEFS.map((o) => o.value) as [ObjectiveValue, ...ObjectiveValue[]];
export const EDITABLE_STATUSES = ["draft", "changes_requested"] as const;

function rupees(label: string, raw: unknown, required = false): number | null {
  try {
    return required ? parseRupees(String(raw ?? "")) : parseOptionalRupees(String(raw ?? ""));
  } catch (e) {
    if (e instanceof MoneyError) throw new ValidationError(`${label}: ${e.message}`);
    throw e;
  }
}

/** Load for editing: permission, editable status. */
async function editable(db: DbOrTx, actor: Actor, id: string): Promise<FullCampaign> {
  const full = await getCampaign(db, actor, id, "campaign.edit");
  if (!(EDITABLE_STATUSES as readonly string[]).includes(full.campaign.status)) {
    throw new ValidationError("This campaign can no longer be edited. Request changes to reopen it.");
  }
  return full;
}

/** Every edit bumps the version, which invalidates any earlier approval. */
async function touch(tx: Tx, campaignId: string, extra: Partial<typeof campaigns.$inferInsert> = {}) {
  await tx
    .update(campaigns)
    .set({ ...extra, version: sql`${campaigns.version} + 1`, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));
}

// ------------------------------------------------------------------ create

const createSchema = z.object({
  dealershipId: z.string().uuid("Choose a dealership"),
  primaryLocationId: z.string().uuid("Choose a location"),
  name: requiredText("Campaign name", 160),
  objective: z.enum(OBJECTIVE_VALUES, { errorMap: () => ({ message: "Choose an objective" }) }),
  templateId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
});

export async function createDraft(db: Database, actor: Actor, organisationId: string, input: unknown) {
  requireOrg(actor, organisationId, "campaign.edit");
  const data = parse(createSchema, input);
  return db.transaction(async (tx) => {
    const dealership = await tx.query.dealerships.findFirst({ where: and(eq(dealerships.id, data.dealershipId), eq(dealerships.organisationId, organisationId)) });
    if (!dealership) throw new NotFoundError("Dealership not found");
    if (dealership.status !== "active") throw new ValidationError("This dealership is inactive");
    const loc = await tx.query.locations.findFirst({ where: and(eq(locations.id, data.primaryLocationId), eq(locations.dealershipId, dealership.id)) });
    if (!loc) throw new ValidationError("Choose a location that belongs to this dealership", { primaryLocationId: "Not part of this dealership" });
    requireLocation(actor, organisationId, loc.id);
    if (loc.status !== "active") throw new ValidationError("This location is inactive");
    if (loc.supportedObjectives.length && !loc.supportedObjectives.includes(data.objective)) {
      throw new ValidationError(`${loc.name} is not configured for this campaign type`, { objective: "Not enabled for this location" });
    }
    let template: typeof creativeTemplates.$inferSelect | undefined;
    if (data.templateId) {
      template = await tx.query.creativeTemplates.findFirst({
        where: and(eq(creativeTemplates.id, data.templateId), or(isNull(creativeTemplates.organisationId), eq(creativeTemplates.organisationId, organisationId))),
      });
      if (!template) throw new NotFoundError("Template not found");
    }
    const [c] = await tx
      .insert(campaigns)
      .values({
        organisationId,
        dealershipId: dealership.id,
        primaryLocationId: loc.id,
        name: data.name,
        objective: data.objective,
        templateId: template?.id ?? null,
        vehicleCategory: dealership.vehicleCategory,
        brand: dealership.brands[0] ?? null,
        bookingUrl: dealership.website,
        managed: false,
        createdById: actor.user.id,
      })
      .returning();
    await tx.insert(campaignTargeting).values({ campaignId: c.id, locationId: loc.id, radiusKm: loc.defaultRadiusKm, excludePincodes: loc.excludedPincodes });
    const fill = (s: string) =>
      s
        .replaceAll("{dealership}", dealership.name)
        .replaceAll("{city}", loc.city)
        .replaceAll("{location}", loc.name)
        .replaceAll("{brand}", dealership.brands[0] ?? "{brand}");
    await tx.insert(campaignCreatives).values({
      campaignId: c.id,
      headline: template ? fill(template.headline) : "",
      primaryText: template ? fill(template.primaryText) : "",
      description: template ? fill(template.description) : "",
      callToAction: template?.callToAction ?? "LEARN_MORE",
      landingUrl: dealership.website ?? "",
    });
    await audit(tx, actor, {
      action: "campaign.created",
      entityType: "campaign",
      entityId: c.id,
      organisationId,
      summary: `Created draft "${c.name}" (${objectiveDef(c.objective)?.label}) for ${loc.name}${template ? ` from template ${template.name}` : ""}`,
    });
    return c;
  });
}

// ------------------------------------------------------------------ basics & product

const productSchema = z.object({
  name: requiredText("Campaign name", 160),
  objective: z.enum(OBJECTIVE_VALUES),
  brand: optionalText(80),
  model: optionalText(80),
  variant: optionalText(80),
  vehicleCategory: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["passenger_cars", "two_wheelers", "commercial_vehicles", "electric_vehicles", "multi_category"]).optional()),
  offerHeadline: optionalText(120),
  offerDetails: optionalText(1000),
  startingPrice: z.string().optional(),
  priceVerified: z.boolean(),
  financeDetails: optionalText(500),
  financeApproved: z.boolean(),
  bookingUrl: optionalHttpsUrl,
  disclaimer: optionalText(1000),
});

export async function updateProduct(db: Database, actor: Actor, id: string, input: unknown) {
  const full = await editable(db, actor, id);
  const data = parse(productSchema, input);
  const startingPrice = rupees("Starting price", data.startingPrice);
  const c = full.campaign;
  const loc = full.primaryLocation;
  if (loc.supportedObjectives.length && !loc.supportedObjectives.includes(data.objective)) {
    throw new ValidationError(`${loc.name} is not configured for this campaign type`, { objective: "Not enabled for this location" });
  }
  const claimFieldsChanged =
    c.offerHeadline !== (data.offerHeadline ?? null) ||
    c.offerDetails !== (data.offerDetails ?? null) ||
    c.startingPrice !== startingPrice ||
    c.financeDetails !== (data.financeDetails ?? null) ||
    c.disclaimer !== (data.disclaimer ?? null) ||
    c.objective !== data.objective;
  const sensitive = objectiveDef(data.objective)?.claimSensitive || !!startingPrice || !!data.financeDetails || !!data.offerDetails || !!data.offerHeadline;
  const claimsStatus = !sensitive ? "not_required" : claimFieldsChanged || c.claimsStatus === "not_required" ? "pending" : c.claimsStatus;
  await db.transaction(async (tx) => {
    await touch(tx, c.id, {
      name: data.name,
      objective: data.objective,
      brand: data.brand ?? null,
      model: data.model ?? null,
      variant: data.variant ?? null,
      vehicleCategory: data.vehicleCategory ?? null,
      offerHeadline: data.offerHeadline ?? null,
      offerDetails: data.offerDetails ?? null,
      startingPrice,
      priceVerified: startingPrice ? data.priceVerified : false,
      financeDetails: data.financeDetails ?? null,
      financeApproved: data.financeDetails ? data.financeApproved : false,
      bookingUrl: data.bookingUrl ?? null,
      disclaimer: data.disclaimer ?? null,
      claimsStatus,
      claimsReviewedById: claimsStatus === "pending" ? null : c.claimsReviewedById,
    });
    // Objective changes can change the provider campaign type or make a platform unsupported.
    if (c.objective !== data.objective) {
      for (const { platform } of full.platforms) {
        const type = resolveCampaignType(data.objective, platform.provider, { metaLeadFormId: full.creative?.metaLeadFormId });
        if (type) await tx.update(campaignPlatforms).set({ providerCampaignType: type }).where(eq(campaignPlatforms.id, platform.id));
        else await tx.delete(campaignPlatforms).where(eq(campaignPlatforms.id, platform.id));
      }
    }
    await audit(tx, actor, {
      action: "campaign.product_updated",
      entityType: "campaign",
      entityId: c.id,
      organisationId: c.organisationId,
      summary: `Updated objective and product details of "${data.name}"`,
      data: { objective: data.objective, model: data.model, startingPrice, claimsStatus },
    });
  });
}

// ------------------------------------------------------------------ platforms

const platformsSchema = z.object({
  providers: z.array(z.enum(["meta", "google"])).min(1, "Choose at least one platform"),
  metaAccountId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  googleAccountId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
});

export async function setPlatforms(db: Database, actor: Actor, id: string, input: unknown) {
  const full = await editable(db, actor, id);
  const data = parse(platformsSchema, input);
  const c = full.campaign;
  for (const p of data.providers) {
    const m = providerMapping(c.objective, p);
    if (!m.supported) throw new ValidationError(`${p === "meta" ? "Meta Ads" : "Google Ads"} cannot run this objective: ${m.note}`);
  }
  await db.transaction(async (tx) => {
    for (const { platform } of full.platforms) {
      if (!data.providers.includes(platform.provider)) await tx.delete(campaignPlatforms).where(eq(campaignPlatforms.id, platform.id));
    }
    for (const provider of data.providers) {
      const accountId = provider === "meta" ? data.metaAccountId : data.googleAccountId;
      if (accountId) {
        const acct = await tx.query.providerAccounts.findFirst({
          where: and(eq(providerAccounts.id, accountId), eq(providerAccounts.organisationId, c.organisationId), eq(providerAccounts.provider, provider)),
        });
        if (!acct) throw new ValidationError("Selected ad account does not belong to this organisation");
      }
      const type = resolveCampaignType(c.objective, provider, { metaLeadFormId: full.creative?.metaLeadFormId })!;
      const existing = full.platforms.find((p) => p.platform.provider === provider);
      if (existing) {
        await tx.update(campaignPlatforms).set({ providerCampaignType: type, providerAccountId: accountId ?? null }).where(eq(campaignPlatforms.id, existing.platform.id));
      } else {
        await tx.insert(campaignPlatforms).values({ campaignId: c.id, organisationId: c.organisationId, provider, providerCampaignType: type, providerAccountId: accountId ?? null });
      }
    }
    await touch(tx, c.id);
    await audit(tx, actor, { action: "campaign.platforms_updated", entityType: "campaign", entityId: c.id, organisationId: c.organisationId, summary: `Platforms set to ${data.providers.join(" and ")}` });
  });
}

// ------------------------------------------------------------------ targeting & audience

const targetingSchema = z.object({
  targets: z
    .array(
      z.object({
        locationId: z.string().uuid(),
        radiusKm: z.coerce.number().int("Radius must be whole kilometres").min(1, "Minimum radius is 1 km").max(80, "Maximum radius is 80 km"),
        includePincodes: pincodeList,
        excludePincodes: pincodeList,
      }),
    )
    .min(1, "Choose at least one location"),
  ageMin: z.coerce.number().int().min(18, "Minimum age is 18").max(65),
  ageMax: z.coerce.number().int().min(18).max(65, "Maximum age is 65"),
  languages: z.array(z.enum(["en", "hi", "mr", "ta", "te", "kn", "ml", "bn", "gu", "pa"])).default([]),
  placements: z.enum(["automatic", "facebook_only", "instagram_only"]).default("automatic"),
  keywords: z
    .preprocess((v) => (typeof v === "string" ? v.split(/[\n,]+/).map((k) => k.trim()).filter(Boolean) : v), z.array(z.string().max(80, "Keywords must be 80 characters or fewer")).max(50, "Up to 50 keywords"))
    .transform((v) => Array.from(new Set(v.map((k) => k.toLowerCase())))),
  overlapOverrideReason: optionalText(500),
});

export async function updateTargeting(db: Database, actor: Actor, id: string, input: unknown) {
  const full = await editable(db, actor, id);
  const data = parse(targetingSchema, input);
  if (data.ageMin > data.ageMax) throw new ValidationError("Minimum age must not be above maximum age", { ageMin: "Above maximum" });
  const c = full.campaign;
  const locs = await db.select().from(locations).where(and(eq(locations.organisationId, c.organisationId), inArray(locations.id, data.targets.map((t) => t.locationId))));
  if (locs.length !== data.targets.length) throw new ValidationError("A selected location does not belong to this organisation");
  if (!data.targets.some((t) => t.locationId === c.primaryLocationId)) throw new ValidationError("Targeting must include the campaign's primary location");
  const warnings: string[] = [];
  for (const t of data.targets) {
    const loc = locs.find((l) => l.id === t.locationId)!;
    requireLocation(actor, c.organisationId, loc.id);
    if (loc.status !== "active") throw new ValidationError(`${loc.name} is inactive`);
    if (loc.permittedPincodes.length) {
      const outside = t.includePincodes.filter((p) => !loc.permittedPincodes.includes(p));
      if (outside.length) throw new ValidationError(`${loc.name} may not target PIN codes ${outside.join(", ")}`);
    }
    const forbidden = t.includePincodes.filter((p) => loc.excludedPincodes.includes(p));
    if (forbidden.length) throw new ValidationError(`${loc.name} excludes PIN codes ${forbidden.join(", ")}`);
    t.excludePincodes = Array.from(new Set([...t.excludePincodes, ...loc.excludedPincodes]));
    // Territory check: other organisations' catchments, and this organisation's other dealerships.
    const overlaps = (await findOverlaps(db, c.organisationId, { lat: loc.latitude, lng: loc.longitude, radiusKm: t.radiusKm }, loc.id)).filter(
      (o) => !o.sameOrganisation,
    );
    if (overlaps.length) warnings.push(`${loc.name} at ${t.radiusKm} km overlaps ${overlaps.length} other dealer territory(ies) by up to ${overlaps[0].overlapKm} km`);
  }
  if (warnings.length) {
    const canOverride = actor.membership?.organisationId === c.organisationId && ["owner", "admin"].includes(actor.membership.role);
    if (!canOverride) throw new ValidationError(`${warnings.join("; ")}. Reduce the radius or ask an organisation admin to override.`);
    if (!data.overlapOverrideReason) {
      throw new ValidationError(`${warnings.join("; ")}. Reduce the radius or record a reason to override.`, { overlapOverrideReason: "Reason required to override" });
    }
  }
  await db.transaction(async (tx) => {
    await tx.delete(campaignTargeting).where(eq(campaignTargeting.campaignId, c.id));
    await tx.insert(campaignTargeting).values(
      data.targets.map((t) => ({
        campaignId: c.id,
        locationId: t.locationId,
        radiusKm: t.radiusKm,
        includePincodes: t.includePincodes,
        excludePincodes: t.excludePincodes,
        overlapOverrideById: warnings.length ? actor.user.id : null,
        overlapOverrideReason: warnings.length ? data.overlapOverrideReason ?? null : null,
      })),
    );
    // Budgets for locations no longer targeted are removed.
    await tx.delete(campaignBudgets).where(and(eq(campaignBudgets.campaignId, c.id), sql`${campaignBudgets.locationId} NOT IN (${sql.join(data.targets.map((t) => sql`${t.locationId}`), sql`, `)})`));
    await touch(tx, c.id, { ageMin: data.ageMin, ageMax: data.ageMax, languages: data.languages, placements: data.placements, keywords: data.keywords });
    await audit(tx, actor, {
      action: "campaign.targeting_updated",
      entityType: "campaign",
      entityId: c.id,
      organisationId: c.organisationId,
      summary: `Targeting: ${data.targets.map((t) => `${locs.find((l) => l.id === t.locationId)!.name} ${t.radiusKm} km`).join(", ")}`,
      data: { targets: data.targets, overlapWarnings: warnings, overlapOverrideReason: data.overlapOverrideReason ?? null },
    });
  });
  return { warnings };
}

// ------------------------------------------------------------------ budget & schedule

const budgetSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an end date"),
  maxAuthorisedSpend: z.string(),
  alertThresholdPct: z.coerce.number().int().min(10, "Threshold must be between 10% and 100%").max(100),
  /** key = `${platformId}:${locationId}`, value = { lifetime, daily } rupee strings */
  allocations: z.record(z.object({ lifetime: z.string().default(""), daily: z.string().default("") })),
});

export async function updateBudget(db: Database, actor: Actor, id: string, input: unknown) {
  const full = await editable(db, actor, id);
  const data = parse(budgetSchema, input);
  if (data.endDate < data.startDate) throw new ValidationError("End date must be on or after the start date", { endDate: "Before start date" });
  const maxAuthorisedSpend = rupees("Maximum authorised spend", data.maxAuthorisedSpend, true)!;
  const c = full.campaign;
  const rows: { platformId: string; locationId: string; lifetime: number; daily: number | null }[] = [];
  for (const [key, v] of Object.entries(data.allocations)) {
    const [platformId, locationId] = key.split(":");
    if (!full.platforms.some((p) => p.platform.id === platformId)) throw new ValidationError("Unknown platform in budget");
    if (!full.targets.some((t) => t.location.id === locationId)) throw new ValidationError("Budget location is not targeted by this campaign");
    const lifetime = rupees("Budget", v.lifetime);
    const daily = rupees("Daily budget", v.daily);
    if (!lifetime) continue;
    if (daily && daily > lifetime) throw new ValidationError("A daily budget cannot exceed the lifetime budget");
    rows.push({ platformId, locationId, lifetime, daily });
  }
  const total = rows.reduce((s, r) => s + r.lifetime, 0);
  if (total > maxAuthorisedSpend) {
    throw new ValidationError("The planned budget exceeds the maximum authorised spend", { maxAuthorisedSpend: "Lower than the planned budget" });
  }
  await db.transaction(async (tx) => {
    await tx.delete(campaignBudgets).where(eq(campaignBudgets.campaignId, c.id));
    if (rows.length) {
      await tx.insert(campaignBudgets).values(rows.map((r) => ({ campaignId: c.id, campaignPlatformId: r.platformId, locationId: r.locationId, lifetimeBudget: r.lifetime, dailyBudget: r.daily })));
    }
    await touch(tx, c.id, { startDate: data.startDate, endDate: data.endDate, maxAuthorisedSpend, alertThresholdPct: data.alertThresholdPct });
    await audit(tx, actor, {
      action: "campaign.budget_updated",
      entityType: "campaign",
      entityId: c.id,
      organisationId: c.organisationId,
      summary: `Budget plan ${total / 100} INR across ${rows.length} allocation(s); max authorised ${maxAuthorisedSpend / 100} INR; ${data.startDate} to ${data.endDate}`,
      data: { rows, maxAuthorisedSpend, alertThresholdPct: data.alertThresholdPct },
    });
  });
}

// ------------------------------------------------------------------ creative

const lines = (max: number, count: number) =>
  z
    .preprocess((v) => (typeof v === "string" ? v.split("\n").map((s) => s.trim()).filter(Boolean) : v ?? []), z.array(z.string().max(max, `Each line must be ${max} characters or fewer`)).max(count, `Up to ${count} lines`));

const creativeSchema = z.object({
  headline: optionalText(255),
  primaryText: optionalText(2000),
  description: optionalText(255),
  headlines: lines(30, 15),
  descriptions: lines(90, 4),
  callToAction: z.enum(CALL_TO_ACTIONS.map((c) => c.value) as [string, ...string[]]),
  landingUrl: optionalHttpsUrl,
  metaLeadFormId: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{5,25}$/, "Lead form id is numeric").optional()),
  whatsappNumber: optionalIndianPhone,
  phoneNumber: optionalIndianPhone,
  assetIds: z.array(z.string().uuid()).max(5).default([]),
});

export async function updateCreative(db: Database, actor: Actor, id: string, input: unknown) {
  const full = await editable(db, actor, id);
  const data = parse(creativeSchema, input);
  const c = full.campaign;
  if (data.assetIds.length) {
    const owned = await db.select({ id: creativeAssets.id }).from(creativeAssets).where(and(eq(creativeAssets.organisationId, c.organisationId), inArray(creativeAssets.id, data.assetIds)));
    if (owned.length !== data.assetIds.length) throw new ValidationError("Selected media does not belong to this organisation");
  }
  await db.transaction(async (tx) => {
    const values = {
      headline: data.headline ?? "",
      primaryText: data.primaryText ?? "",
      description: data.description ?? "",
      headlines: data.headlines,
      descriptions: data.descriptions,
      callToAction: data.callToAction,
      landingUrl: data.landingUrl ?? "",
      metaLeadFormId: data.metaLeadFormId ?? null,
      whatsappNumber: data.whatsappNumber ?? null,
      phoneNumber: data.phoneNumber ?? null,
      assetIds: data.assetIds,
    };
    if (full.creative) await tx.update(campaignCreatives).set(values).where(eq(campaignCreatives.id, full.creative.id));
    else await tx.insert(campaignCreatives).values({ campaignId: c.id, ...values });
    // A lead form switches Meta to an instant-form campaign, and back.
    for (const { platform } of full.platforms.filter((p) => p.platform.provider === "meta")) {
      const type = resolveCampaignType(c.objective, "meta", { metaLeadFormId: values.metaLeadFormId });
      if (type) await tx.update(campaignPlatforms).set({ providerCampaignType: type }).where(eq(campaignPlatforms.id, platform.id));
    }
    await touch(tx, c.id);
    await audit(tx, actor, { action: "campaign.creative_updated", entityType: "campaign", entityId: c.id, organisationId: c.organisationId, summary: `Updated creative for "${c.name}"`, data: { headline: values.headline, landingUrl: values.landingUrl, assets: values.assetIds.length } });
  });
}

export async function uploadAsset(db: Database, actor: Actor, organisationId: string, file: File, licence: { confirmed: boolean; note?: string }) {
  requireOrg(actor, organisationId, "campaign.edit");
  if (!licence.confirmed) {
    throw new ForbiddenError("Confirm you own or are licensed to use this media. Manufacturer logos and product images need the manufacturer's authorisation.");
  }
  const up = await validateUpload(file);
  const key = `orgs/${organisationId}/assets/${up.sha256.slice(0, 2)}/${up.sha256}`;
  await putObject(key, up.bytes, up.mime);
  return db.transaction(async (tx) => {
    const [asset] = await tx
      .insert(creativeAssets)
      .values({
        organisationId,
        storageKey: key,
        filename: up.filename,
        mimeType: up.mime,
        kind: up.kind,
        sizeBytes: up.bytes.length,
        width: up.width,
        height: up.height,
        sha256: up.sha256,
        licenceConfirmed: true,
        licenceNote: licence.note?.slice(0, 500) ?? null,
        uploadedById: actor.user.id,
      })
      .returning();
    await audit(tx, actor, { action: "asset.uploaded", entityType: "creative_asset", entityId: asset.id, organisationId, summary: `Uploaded ${up.kind} ${up.filename} (licence confirmed)`, data: { sha256: up.sha256, note: licence.note ?? null } });
    return asset;
  });
}

export async function listAssets(db: DbOrTx, actor: Actor, organisationId: string) {
  requireOrg(actor, organisationId, "campaign.view");
  return db.select().from(creativeAssets).where(eq(creativeAssets.organisationId, organisationId)).orderBy(sql`${creativeAssets.createdAt} desc`);
}

export async function getAssetForDownload(db: DbOrTx, actor: Actor, assetId: string) {
  const asset = await db.query.creativeAssets.findFirst({ where: eq(creativeAssets.id, assetId) });
  if (!asset) throw new NotFoundError("Not found");
  requireOrg(actor, asset.organisationId, "campaign.view");
  return asset;
}

export async function listTemplates(db: DbOrTx, actor: Actor, organisationId: string) {
  requireOrg(actor, organisationId, "campaign.view");
  return db
    .select()
    .from(creativeTemplates)
    .where(and(eq(creativeTemplates.isActive, true), or(isNull(creativeTemplates.organisationId), eq(creativeTemplates.organisationId, organisationId))))
    .orderBy(creativeTemplates.category);
}
