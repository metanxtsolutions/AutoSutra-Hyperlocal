import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { dealerships, locations, organisationMemberships, organisations, users } from "@/server/db/schema";
import { loadActor, type Actor } from "@/server/auth/context";
import type { OrgRole, PlatformRole } from "@/server/auth/permissions";

let counter = 0;
// A precomputed scrypt hash of "correct horse battery" keeps test setup fast.
export const TEST_PASSWORD = "correct horse battery";
let cachedHash: string | null = null;

async function passwordHash() {
  if (!cachedHash) {
    const { hashPassword } = await import("@/server/crypto");
    cachedHash = await hashPassword(TEST_PASSWORD);
  }
  return cachedHash;
}

export async function makeUser(opts: { email?: string; name?: string; platformRole?: PlatformRole; verified?: boolean } = {}) {
  counter += 1;
  const [u] = await getDb()
    .insert(users)
    .values({
      email: opts.email ?? `user${counter}@example.test`,
      name: opts.name ?? `User ${counter}`,
      passwordHash: await passwordHash(),
      platformRole: opts.platformRole ?? null,
      emailVerifiedAt: opts.verified === false ? null : new Date(),
    })
    .returning();
  return u;
}

export async function makeOrg(name = `Org ${++counter}`, type: "independent_dealership" | "dealer_group" | "agency" = "dealer_group") {
  const [o] = await getDb().insert(organisations).values({ name, type }).returning();
  return o;
}

export async function addMember(orgId: string, userId: string, role: OrgRole, allLocations = true) {
  const [m] = await getDb().insert(organisationMemberships).values({ organisationId: orgId, userId, role, allLocations }).returning();
  return m;
}

export async function actorFor(userId: string, orgId: string | null = null): Promise<Actor> {
  const a = await loadActor(getDb(), userId, orgId, "127.0.0.1");
  if (!a) throw new Error("no actor");
  return a;
}

/** An organisation with an owner, a dealership and one location. */
export async function makeTenant(name = `Tenant ${++counter}`, coords = { lat: 19.076, lng: 72.8777 }) {
  const org = await makeOrg(name);
  const owner = await makeUser({ name: `${name} Owner` });
  await addMember(org.id, owner.id, "owner");
  const [dealer] = await getDb()
    .insert(dealerships)
    .values({
      organisationId: org.id,
      name: `${name} Motors`,
      brands: ["Tata"],
      vehicleCategory: "passenger_cars",
      dealershipType: "new_vehicle",
      address: "1 Main Road",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
    })
    .returning();
  const [location] = await getDb()
    .insert(locations)
    .values({
      organisationId: org.id,
      dealershipId: dealer.id,
      name: `${name} Showroom`,
      address: "1 Main Road",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
      latitude: coords.lat,
      longitude: coords.lng,
      defaultRadiusKm: 5,
    })
    .returning();
  const actor = await actorFor(owner.id, org.id);
  return { org, owner, dealer, location, actor };
}

export async function reloadUser(id: string) {
  return getDb().query.users.findFirst({ where: eq(users.id, id) });
}

/** Drizzle wraps Postgres errors; assert on the underlying database message. */
export async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  try {
    await promise;
  } catch (e) {
    const err = e as { message?: string; cause?: { message?: string } };
    const text = `${err.message ?? ""} ${err.cause?.message ?? ""}`;
    if (!pattern.test(text)) throw new Error(`Expected error matching ${pattern}, got: ${text}`);
    return;
  }
  throw new Error(`Expected a database error matching ${pattern}`);
}
