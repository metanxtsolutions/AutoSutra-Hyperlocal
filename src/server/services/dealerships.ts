import { and, asc, between, count, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "../db/client";
import { dealerships, locations, organisationMemberships, organisations, subscriptionPlans, subscriptions } from "../db/schema";
import { audit } from "../audit";
import { locationScope, requireLocation, requireOrg, type Actor } from "../auth/context";
import { circleOverlapKm } from "@/lib/geo";
import { parseOptionalRupees, MoneyError } from "@/lib/money";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import {
  indianState,
  latitude,
  longitude,
  optionalGstin,
  optionalHttpsUrl,
  optionalIndianPhone,
  optionalText,
  parse,
  pincode,
  pincodeList,
  requiredText,
} from "../validation";

const VEHICLE_CATEGORIES = ["passenger_cars", "two_wheelers", "commercial_vehicles", "electric_vehicles", "multi_category"] as const;
const DEALERSHIP_TYPES = ["new_vehicle", "pre_owned", "service_centre", "multi_format"] as const;
const LOCATION_KINDS = ["showroom", "service_centre", "pre_owned_outlet", "workshop", "experience_centre"] as const;

const dealershipSchema = z.object({
  name: requiredText("Dealership name", 160),
  brands: z
    .preprocess((v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v), z.array(z.string().max(60)).min(1, "Add at least one brand").max(20))
    .transform((v) => Array.from(new Set(v))),
  vehicleCategory: z.enum(VEHICLE_CATEGORIES, { errorMap: () => ({ message: "Choose a vehicle category" }) }),
  dealershipType: z.enum(DEALERSHIP_TYPES, { errorMap: () => ({ message: "Choose a dealership type" }) }),
  address: requiredText("Address", 500),
  city: requiredText("City", 100),
  state: indianState,
  pincode,
  latitude: z.preprocess((v) => (v === "" ? undefined : v), latitude.optional()),
  longitude: z.preprocess((v) => (v === "" ? undefined : v), longitude.optional()),
  contactName: optionalText(120),
  contactPhone: optionalIndianPhone,
  businessEmail: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().toLowerCase().email("Enter a valid email").optional()),
  website: optionalHttpsUrl,
  googleBusinessProfileUrl: optionalHttpsUrl,
  gstin: optionalGstin,
});

export async function listDealerships(db: DbOrTx, actor: Actor, organisationId: string) {
  requireOrg(actor, organisationId, "dealership.view");
  const rows = await db.query.dealerships.findMany({
    where: eq(dealerships.organisationId, organisationId),
    orderBy: asc(dealerships.name),
  });
  const scope = locationScope(actor, organisationId);
  if (scope === null) return rows;
  const allowed = scope.length
    ? await db.select({ d: locations.dealershipId }).from(locations).where(inArray(locations.id, scope))
    : [];
  const ids = new Set(allowed.map((a) => a.d));
  return rows.filter((r) => ids.has(r.id));
}

export async function getDealership(db: DbOrTx, actor: Actor, dealershipId: string) {
  const d = await db.query.dealerships.findFirst({ where: eq(dealerships.id, dealershipId) });
  if (!d) throw new NotFoundError("Not found");
  requireOrg(actor, d.organisationId, "dealership.view");
  const scope = locationScope(actor, d.organisationId);
  if (scope !== null) {
    const visible = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.dealershipId, d.id), inArray(locations.id, scope.length ? scope : ["00000000-0000-0000-0000-000000000000"])));
    if (!visible.length) throw new NotFoundError("Not found");
  }
  return d;
}

export async function createDealership(db: Database, actor: Actor, organisationId: string, input: unknown) {
  requireOrg(actor, organisationId, "dealership.manage");
  const data = parse(dealershipSchema, input);
  return db.transaction(async (tx) => {
    const org = await tx.query.organisations.findFirst({ where: eq(organisations.id, organisationId) });
    if (!org || org.status !== "active") throw new ForbiddenError("This organisation is suspended");
    if (org.type === "independent_dealership") {
      const [{ n }] = await tx.select({ n: count() }).from(dealerships).where(eq(dealerships.organisationId, organisationId));
      if (n >= 1) throw new ValidationError("An independent dealership organisation has one dealership. Change the organisation type to dealer group to add more.");
    }
    const [d] = await tx
      .insert(dealerships)
      .values({ organisationId, ...nullify(data) })
      .returning();
    await audit(tx, actor, { action: "dealership.created", entityType: "dealership", entityId: d.id, organisationId, summary: `Added dealership ${d.name}`, data });
    return d;
  });
}

export async function updateDealership(db: Database, actor: Actor, dealershipId: string, input: unknown) {
  const existing = await getDealership(db, actor, dealershipId);
  requireOrg(actor, existing.organisationId, "dealership.manage");
  const data = parse(dealershipSchema, input);
  await db.transaction(async (tx) => {
    const values = nullify(data);
    const identityChanged = existing.name !== values.name || existing.gstin !== values.gstin || existing.address !== values.address;
    await tx
      .update(dealerships)
      .set({ ...values, verificationStatus: identityChanged && existing.verificationStatus === "verified" ? "pending" : existing.verificationStatus })
      .where(eq(dealerships.id, dealershipId));
    await audit(tx, actor, {
      action: "dealership.updated",
      entityType: "dealership",
      entityId: dealershipId,
      organisationId: existing.organisationId,
      summary: `Updated dealership ${values.name}`,
      data: { changes: diff(existing as unknown as Record<string, unknown>, values) },
    });
  });
}

export async function setDealershipStatus(db: Database, actor: Actor, dealershipId: string, status: "active" | "inactive") {
  const d = await getDealership(db, actor, dealershipId);
  requireOrg(actor, d.organisationId, "dealership.manage");
  await db.transaction(async (tx) => {
    await tx.update(dealerships).set({ status }).where(eq(dealerships.id, dealershipId));
    await audit(tx, actor, { action: `dealership.${status === "active" ? "activated" : "deactivated"}`, entityType: "dealership", entityId: d.id, organisationId: d.organisationId, summary: `${status === "active" ? "Activated" : "Deactivated"} ${d.name}` });
  });
}

// ------------------------------------------------------------------ locations

const locationSchema = z.object({
  name: requiredText("Location name", 160),
  kind: z.enum(LOCATION_KINDS),
  address: requiredText("Address", 500),
  city: requiredText("City", 100),
  state: indianState,
  pincode,
  latitude,
  longitude,
  defaultRadiusKm: z.coerce.number().int("Radius must be a whole number of km").min(1, "Minimum radius is 1 km").max(80, "Maximum radius is 80 km"),
  permittedPincodes: pincodeList,
  excludedPincodes: pincodeList,
  supportedObjectives: z.array(z.string()).default([]),
  monthlyBudgetLimit: z.string().optional(),
  leadRoutingUserId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  overlapOverrideReason: optionalText(500),
});

export interface OverlapWarning {
  locationId: string;
  locationName: string;
  dealershipName: string;
  overlapKm: number;
  sameOrganisation: boolean;
}

/**
 * Locations whose default catchment overlaps the given circle. Other organisations'
 * names are never revealed; they appear as "another dealer's territory".
 */
export async function findOverlaps(
  db: DbOrTx,
  organisationId: string,
  circle: { lat: number; lng: number; radiusKm: number },
  excludeLocationId?: string,
): Promise<OverlapWarning[]> {
  // Bounding-box prefilter (1 degree latitude ≈ 111 km). PostGIS can replace this at scale.
  const pad = (circle.radiusKm + 80) / 111;
  const rows = await db
    .select({ l: locations, dealershipName: dealerships.name })
    .from(locations)
    .innerJoin(dealerships, eq(dealerships.id, locations.dealershipId))
    .where(
      and(
        eq(locations.status, "active"),
        excludeLocationId ? ne(locations.id, excludeLocationId) : undefined,
        between(locations.latitude, circle.lat - pad, circle.lat + pad),
        between(locations.longitude, circle.lng - pad * 1.2, circle.lng + pad * 1.2),
      ),
    );
  return rows
    .map((r) => ({
      r,
      overlap: circleOverlapKm(circle, { lat: r.l.latitude, lng: r.l.longitude, radiusKm: r.l.defaultRadiusKm }),
    }))
    .filter((x) => x.overlap > 0)
    .map(({ r, overlap }) => {
      const same = r.l.organisationId === organisationId;
      return {
        locationId: same ? r.l.id : "",
        locationName: same ? r.l.name : "Another dealer's territory",
        dealershipName: same ? r.dealershipName : "Undisclosed",
        overlapKm: Math.round(overlap * 10) / 10,
        sameOrganisation: same,
      };
    })
    .sort((a, b) => b.overlapKm - a.overlapKm);
}

function parseLimit(raw: string | undefined): number | null {
  try {
    return parseOptionalRupees(raw);
  } catch (e) {
    if (e instanceof MoneyError) throw new ValidationError(e.message, { monthlyBudgetLimit: e.message });
    throw e;
  }
}

async function checkPlanLocationLimit(tx: DbOrTx, organisationId: string) {
  const sub = await tx
    .select({ max: subscriptionPlans.maxLocations, name: subscriptionPlans.name })
    .from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId))
    .where(and(eq(subscriptions.organisationId, organisationId), inArray(subscriptions.status, ["trialing", "active", "past_due"])))
    .limit(1);
  const max = sub[0]?.max;
  if (max === null || max === undefined) return;
  const [{ n }] = await tx.select({ n: count() }).from(locations).where(and(eq(locations.organisationId, organisationId), eq(locations.status, "active")));
  if (n >= max) throw new ValidationError(`Your ${sub[0].name} plan includes ${max} active location(s). Upgrade to add more.`);
}

async function validateRoutingUser(tx: DbOrTx, organisationId: string, userId: string | undefined) {
  if (!userId) return;
  const m = await tx.query.organisationMemberships.findFirst({
    where: and(eq(organisationMemberships.organisationId, organisationId), eq(organisationMemberships.userId, userId)),
  });
  if (!m) throw new ValidationError("Lead routing user must be a member of this organisation");
}

export async function createLocation(db: Database, actor: Actor, dealershipId: string, input: unknown) {
  const d = await getDealership(db, actor, dealershipId);
  requireOrg(actor, d.organisationId, "location.manage");
  const data = parse(locationSchema, input);
  const limit = parseLimit(data.monthlyBudgetLimit);
  const overlaps = await findOverlaps(db, d.organisationId, { lat: data.latitude, lng: data.longitude, radiusKm: data.defaultRadiusKm });
  assertOverlapAcknowledged(actor, d.organisationId, overlaps, data.overlapOverrideReason);
  return db.transaction(async (tx) => {
    await checkPlanLocationLimit(tx, d.organisationId);
    await validateRoutingUser(tx, d.organisationId, data.leadRoutingUserId);
    const [loc] = await tx
      .insert(locations)
      .values({
        organisationId: d.organisationId,
        dealershipId: d.id,
        name: data.name,
        kind: data.kind,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        latitude: data.latitude,
        longitude: data.longitude,
        defaultRadiusKm: data.defaultRadiusKm,
        permittedPincodes: data.permittedPincodes,
        excludedPincodes: data.excludedPincodes,
        supportedObjectives: data.supportedObjectives,
        monthlyBudgetLimit: limit,
        leadRoutingUserId: data.leadRoutingUserId ?? null,
      })
      .returning();
    await audit(tx, actor, {
      action: "location.created",
      entityType: "location",
      entityId: loc.id,
      organisationId: d.organisationId,
      summary: `Added location ${loc.name} (${loc.city}, ${loc.defaultRadiusKm} km)`,
      data: { overlaps, overlapOverrideReason: data.overlapOverrideReason ?? null },
    });
    if (overlaps.length) {
      await audit(tx, actor, {
        action: "location.overlap_override",
        entityType: "location",
        entityId: loc.id,
        organisationId: d.organisationId,
        summary: `Saved despite ${overlaps.length} territory overlap warning(s): ${data.overlapOverrideReason}`,
        data: { overlaps },
      });
    }
    return loc;
  });
}

export async function updateLocation(db: Database, actor: Actor, locationId: string, input: unknown) {
  const loc = await getLocation(db, actor, locationId);
  requireOrg(actor, loc.organisationId, "location.manage");
  const data = parse(locationSchema, input);
  const limit = parseLimit(data.monthlyBudgetLimit);
  const moved = loc.latitude !== data.latitude || loc.longitude !== data.longitude || loc.defaultRadiusKm !== data.defaultRadiusKm;
  const overlaps = moved ? await findOverlaps(db, loc.organisationId, { lat: data.latitude, lng: data.longitude, radiusKm: data.defaultRadiusKm }, loc.id) : [];
  assertOverlapAcknowledged(actor, loc.organisationId, overlaps, data.overlapOverrideReason);
  await db.transaction(async (tx) => {
    await validateRoutingUser(tx, loc.organisationId, data.leadRoutingUserId);
    const values = {
      name: data.name,
      kind: data.kind,
      address: data.address,
      city: data.city,
      state: data.state,
      pincode: data.pincode,
      latitude: data.latitude,
      longitude: data.longitude,
      defaultRadiusKm: data.defaultRadiusKm,
      permittedPincodes: data.permittedPincodes,
      excludedPincodes: data.excludedPincodes,
      supportedObjectives: data.supportedObjectives,
      monthlyBudgetLimit: limit,
      leadRoutingUserId: data.leadRoutingUserId ?? null,
    };
    await tx.update(locations).set(values).where(eq(locations.id, loc.id));
    await audit(tx, actor, {
      action: "location.updated",
      entityType: "location",
      entityId: loc.id,
      organisationId: loc.organisationId,
      summary: `Updated location ${values.name}`,
      data: { changes: diff(loc as unknown as Record<string, unknown>, values), overlaps, overlapOverrideReason: data.overlapOverrideReason ?? null },
    });
  });
}

function assertOverlapAcknowledged(actor: Actor, organisationId: string, overlaps: OverlapWarning[], reason: string | undefined) {
  if (!overlaps.length) return;
  // Only organisation owners/admins (or AutoSutra admins) may override territory warnings.
  const canOverride =
    actor.membership?.organisationId === organisationId
      ? actor.membership.role === "owner" || actor.membership.role === "admin"
      : actor.user.platformRole === "super_admin";
  const summary = overlaps.map((o) => `${o.locationName} (${o.overlapKm} km)`).join(", ");
  if (!canOverride) {
    throw new ValidationError(`This catchment overlaps: ${summary}. Ask an organisation admin to review and override.`);
  }
  if (!reason?.trim()) {
    throw new ValidationError(`This catchment overlaps: ${summary}. Reduce the radius or record a reason to override.`, {
      overlapOverrideReason: "A reason is required to override territory overlap",
    });
  }
}

export async function getLocation(db: DbOrTx, actor: Actor, locationId: string) {
  const loc = await db.query.locations.findFirst({ where: eq(locations.id, locationId) });
  if (!loc) throw new NotFoundError("Not found");
  requireOrg(actor, loc.organisationId, "dealership.view");
  requireLocation(actor, loc.organisationId, loc.id);
  return loc;
}

export async function listLocations(db: DbOrTx, actor: Actor, organisationId: string, dealershipId?: string) {
  requireOrg(actor, organisationId, "dealership.view");
  const scope = locationScope(actor, organisationId);
  return db
    .select({ location: locations, dealershipName: dealerships.name })
    .from(locations)
    .innerJoin(dealerships, eq(dealerships.id, locations.dealershipId))
    .where(
      and(
        eq(locations.organisationId, organisationId),
        dealershipId ? eq(locations.dealershipId, dealershipId) : undefined,
        scope === null ? undefined : inArray(locations.id, scope.length ? scope : ["00000000-0000-0000-0000-000000000000"]),
      ),
    )
    .orderBy(asc(dealerships.name), asc(locations.name));
}

export async function setLocationStatus(db: Database, actor: Actor, locationId: string, status: "active" | "inactive") {
  const loc = await getLocation(db, actor, locationId);
  requireOrg(actor, loc.organisationId, "location.manage");
  await db.transaction(async (tx) => {
    if (status === "active") await checkPlanLocationLimit(tx, loc.organisationId);
    await tx.update(locations).set({ status }).where(eq(locations.id, loc.id));
    await audit(tx, actor, { action: `location.${status === "active" ? "activated" : "deactivated"}`, entityType: "location", entityId: loc.id, organisationId: loc.organisationId, summary: `${status === "active" ? "Reactivated" : "Deactivated"} ${loc.name}` });
  });
}

// ------------------------------------------------------------------ helpers

type Nullified<T> = { [K in keyof T]-?: undefined extends T[K] ? Exclude<T[K], undefined> | null : T[K] };

function nullify<T extends Record<string, unknown>>(data: T): Nullified<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) out[k] = v === undefined ? null : v;
  return out as Nullified<T>;
}

function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Record<string, [unknown, unknown]> = {};
  for (const [k, v] of Object.entries(after)) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(v ?? null)) changes[k] = [before[k] ?? null, v ?? null];
  }
  return changes;
}
