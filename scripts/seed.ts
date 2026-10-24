import "../src/server/load-env";
/**
 * Demo seed. Creates AutoSutra staff accounts and a demo dealer group with
 * sample campaigns and enquiries (see seed-sample.ts).
 * Runs in development and on hosted previews (APP_STAGE=preview); refuses
 * production. A preview needs SEED_PASSWORD, so its demo accounts never use
 * the published development password.
 *
 *   npm run db:seed
 *   npm run db:seed -- --if-enabled    (deploy builds: only when SEED_DEMO_DATA=true)
 */
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/server/db/client";
import { dealerships, locations, organisationMemberships, organisations, users } from "../src/server/db/schema";
import { hashPassword } from "../src/server/crypto";
import { seedSampleActivity } from "./seed-sample";

const STAGE = process.env.APP_STAGE ?? (process.env.NODE_ENV === "production" ? "production" : "development");
const PASSWORD = process.env.SEED_PASSWORD || (STAGE === "development" ? "autosutra-dev-2026" : "");

async function upsertUser(email: string, name: string, platformRole: "super_admin" | "finance_admin" | "campaign_ops" | null) {
  const db = getDb();
  const existing = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` });
  if (existing) return existing;
  const [u] = await db
    .insert(users)
    .values({ email, name, platformRole, passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date() })
    .returning();
  return u;
}

async function main() {
  if (process.argv.includes("--if-enabled") && process.env.SEED_DEMO_DATA !== "true") {
    console.log("Demo data not requested (SEED_DEMO_DATA is not true)");
    await closeDb();
    return;
  }
  if (STAGE === "production") throw new Error("Refusing to seed a production database");
  if (PASSWORD.length < 12) throw new Error("Set SEED_PASSWORD (at least 12 characters) to seed a preview");
  const db = getDb();
  await upsertUser("admin@autosutra.local", "Platform Admin", "super_admin");
  await upsertUser("finance@autosutra.local", "Finance Admin", "finance_admin");
  await upsertUser("ops@autosutra.local", "Campaign Ops", "campaign_ops");
  const owner = await upsertUser("owner@demo-motors.local", "Demo Owner", null);
  const sales = await upsertUser("sales@demo-motors.local", "Demo Sales", null);

  let org = await db.query.organisations.findFirst({ where: eq(organisations.name, "Demo Motors Group") });
  if (!org) {
    [org] = await db
      .insert(organisations)
      .values({
        name: "Demo Motors Group",
        type: "dealer_group",
        legalName: "Demo Motors Private Limited",
        billingEmail: "accounts@demo-motors.local",
        billingAddress: "12 Link Road, Andheri West, Mumbai 400053",
        billingState: "Maharashtra",
        contactName: "Demo Owner",
        verificationStatus: "pending",
        termsAcceptedAt: new Date(),
        termsVersion: "2026-10-draft",
      })
      .returning();
    await db.insert(organisationMemberships).values([
      { organisationId: org.id, userId: owner.id, role: "owner" },
      { organisationId: org.id, userId: sales.id, role: "sales_user" },
    ]);
    const [d] = await db
      .insert(dealerships)
      .values({
        organisationId: org.id,
        name: "Demo Motors Andheri",
        brands: ["Demo Brand"],
        vehicleCategory: "passenger_cars",
        dealershipType: "new_vehicle",
        address: "12 Link Road, Andheri West",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400053",
        website: "https://example.com",
      })
      .returning();
    await db.insert(locations).values([
      { organisationId: org.id, dealershipId: d.id, name: "Andheri Showroom", address: "12 Link Road, Andheri West", city: "Mumbai", state: "Maharashtra", pincode: "400053", latitude: 19.1364, longitude: 72.8296, defaultRadiusKm: 5 },
      { organisationId: org.id, dealershipId: d.id, name: "Goregaon Service Centre", kind: "service_centre", address: "Aarey Road, Goregaon East", city: "Mumbai", state: "Maharashtra", pincode: "400063", latitude: 19.1663, longitude: 72.8526, defaultRadiusKm: 3 },
    ]);
  }
  try {
    if (await seedSampleActivity(db, org.id, owner.id, sales.id)) console.log("Added sample campaigns and enquiries to Demo Motors Group.");
  } catch (e) {
    // Sample activity is a nicety; never fail a deploy build over it.
    console.warn("Sample activity was not added:", e instanceof Error ? e.message : e);
  }
  console.log(STAGE === "development" ? `Seeded. Sign in with any of the seeded emails and password: ${PASSWORD}` : "Seeded. Sign in with the seeded emails and the SEED_PASSWORD value.");
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
