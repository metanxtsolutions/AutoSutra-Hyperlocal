/**
 * Sample activity for the demo dealer group, so a fresh preview shows how the
 * product looks in use. Everything goes through the normal services, and every
 * record says it is a sample. No provider data is invented: campaigns publish
 * in demo mode (nothing is sent and no spend is reported) and the enquiries are
 * AutoSutra lead records marked "(sample)".
 *
 * Runs once per organisation: it does nothing if sample campaigns already exist.
 * It only adds records; the organisation's own campaigns, leads and alerts are left as they are.
 */
import { and, count, desc, eq, gte, inArray, like } from "drizzle-orm";
import type { Database } from "../src/server/db/client";
import { campaigns as campaignsTable, leads, locations, notifications } from "../src/server/db/schema";
import { loadActor, type Actor } from "../src/server/auth/context";
import * as campaigns from "../src/server/services/campaigns";
import { captureLead, updateLead } from "../src/server/services/leads";
import { requestPublish } from "../src/server/services/publishing";
import { runAllHandlers } from "../src/server/jobs/run";
import { todayIST } from "../src/lib/format";

const SAMPLE_NOTICE = "Sample data created for the preview. Not a real person.";

function addDays(date: string, n: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

async function buildCampaign(
  db: Database,
  actor: Actor,
  orgId: string,
  loc: typeof locations.$inferSelect,
  spec: { name: string; objective: string; model: string; headline: string; text: string; startInDays: number; days: number; budgetRupees: number; keywords: string },
) {
  const c = await campaigns.createDraft(db, actor, orgId, { dealershipId: loc.dealershipId, primaryLocationId: loc.id, name: spec.name, objective: spec.objective });
  await campaigns.updateProduct(db, actor, c.id, { name: spec.name, objective: spec.objective, brand: "Demo Brand", model: spec.model, priceVerified: false, financeApproved: false });
  await campaigns.setPlatforms(db, actor, c.id, { providers: ["meta", "google"] });
  await campaigns.updateTargeting(db, actor, c.id, {
    targets: [{ locationId: loc.id, radiusKm: loc.defaultRadiusKm, includePincodes: "", excludePincodes: "" }],
    ageMin: 21,
    ageMax: 60,
    languages: ["en", "hi"],
    placements: "automatic",
    keywords: spec.keywords,
  });
  const full = await campaigns.loadCampaign(db, c.id);
  const allocations: Record<string, { lifetime: string; daily: string }> = {};
  for (const p of full!.platforms) allocations[`${p.platform.id}:${loc.id}`] = { lifetime: String(spec.budgetRupees), daily: "" };
  const start = addDays(todayIST(), spec.startInDays);
  await campaigns.updateBudget(db, actor, c.id, {
    startDate: start,
    endDate: addDays(start, spec.days - 1),
    maxAuthorisedSpend: String(spec.budgetRupees * full!.platforms.length),
    alertThresholdPct: "80",
    allocations,
  });
  await campaigns.updateCreative(db, actor, c.id, {
    headline: spec.headline,
    primaryText: spec.text,
    description: "",
    headlines: `${spec.headline}\n${spec.model} in Mumbai\nVisit ${loc.name}`,
    descriptions: `${spec.text}\nOpen all week at ${loc.name}.`,
    callToAction: "BOOK_NOW",
    landingUrl: "https://example.com/sample",
    assetIds: [],
  });
  return c;
}

async function approveAndPublish(db: Database, actor: Actor, id: string) {
  const full = await campaigns.getCampaign(db, actor, id);
  const expectedHash = campaigns.hashSnapshot(campaigns.configSnapshot(full));
  await campaigns.approve(db, actor, id, { confirmBudget: true, confirmClaims: true, expectedHash, note: "Sample approval for the preview." });
  await requestPublish(db, actor, id);
  await runAllHandlers(db, { maxJobs: 20, timeBudgetMs: 20_000 });
}

const PEOPLE = [
  ["Aarav S.", "Demo SUV", "test_drive_form", 1, "sold"],
  ["Priya M.", "Demo SUV", "website_form", 2, "booking"],
  ["Rohan K.", "Demo Hatch", "phone_call", 3, "test_drive_completed"],
  ["Sneha P.", "Demo EV", "website_form", 4, "qualified"],
  ["Vikram R.", "Demo SUV", "test_drive_form", 5, "contacted"],
  ["Ananya D.", "Demo Hatch", "whatsapp_click", 6, "lost"],
  ["Karan J.", "Demo EV", "test_drive_form", 8, "test_drive_completed"],
  ["Meera N.", "Demo SUV", "phone_call", 9, "qualified"],
  ["Arjun T.", "Demo Hatch", "website_form", 11, "follow_up_required"],
  ["Ishita G.", "Demo SUV", "manual_upload", 13, "booking"],
  ["Rahul V.", "Demo EV", "website_form", 15, "contacted"],
  ["Pooja L.", "Demo Hatch", "test_drive_form", 17, "sold"],
  ["Nikhil B.", "Demo SUV", "whatsapp_click", 19, "lost"],
  ["Divya A.", "Demo EV", "website_form", 22, "qualified"],
  ["Sameer H.", "Demo SUV", "phone_call", 25, "test_drive_completed"],
  ["Kavya I.", "Demo Hatch", "website_form", 0, "new"],
  ["Aditya C.", "Demo SUV", "test_drive_form", 0, "new"],
] as const;

export async function seedSampleActivity(db: Database, orgId: string, ownerId: string, salesId: string) {
  const [existing] = await db.select({ n: count() }).from(campaignsTable).where(and(eq(campaignsTable.organisationId, orgId), like(campaignsTable.name, "%(sample)")));
  if (existing.n > 0) return false;
  const startedAt = new Date();
  const actor = await loadActor(db, ownerId, orgId, null, { mfaVerified: true });
  if (!actor?.membership) throw new Error("Seed owner has no membership");
  const locs = await db.select().from(locations).where(eq(locations.organisationId, orgId));
  const showroom = locs.find((l) => l.kind !== "service_centre") ?? locs[0];
  const service = locs.find((l) => l.kind === "service_centre") ?? showroom;

  // A campaign published in demo mode, one waiting for approval and one draft.
  const live = await buildCampaign(db, actor, orgId, showroom, {
    name: "Demo SUV test drive weekend (sample)",
    objective: "test_drive_enquiries",
    model: "Demo SUV",
    headline: "Test drive the Demo SUV",
    text: "Book a test drive at our Andheri showroom this weekend.",
    startInDays: 0,
    days: 21,
    budgetRupees: 25000,
    keywords: "demo suv test drive, demo suv andheri, suv showroom mumbai",
  });
  await campaigns.submitForApproval(db, actor, live.id);
  await approveAndPublish(db, actor, live.id);

  const pending = await buildCampaign(db, actor, orgId, service, {
    name: "Festive season service check (sample)",
    objective: "periodic_maintenance",
    model: "All models",
    headline: "Festive check-up at Goregaon",
    text: "Brakes, tyres and lights checked before festive travel. Book a slot near you.",
    startInDays: 3,
    days: 14,
    budgetRupees: 12000,
    keywords: "car service goregaon, festive car check, car service near me",
  });
  await campaigns.submitForApproval(db, actor, pending.id);

  await campaigns.createDraft(db, actor, orgId, { dealershipId: showroom.dealershipId, primaryLocationId: showroom.id, name: "Demo EV launch (sample)", objective: "ev_promotion" });

  // Enquiries spread over the last four weeks, at different stages.
  const now = Date.now();
  for (const [i, [name, model, source, daysAgo, status]] of PEOPLE.entries()) {
    const createdAt = new Date(now - daysAgo * 86_400_000 - (i % 5) * 3_600_000 - 2 * 3_600_000);
    const { lead } = await captureLead(db, { system: "seed" }, {
      organisationId: orgId,
      dealershipId: showroom.dealershipId,
      locationId: i % 4 === 3 ? service.id : showroom.id,
      campaignId: daysAgo === 0 ? live.id : null,
      source,
      name: `${name} (sample)`,
      phone: `90000${String(10001 + i).padStart(5, "0")}`,
      vehicleBrand: "Demo Brand",
      vehicleModel: model,
      message: "Sample enquiry for the preview.",
      consent: { granted: true, noticeText: SAMPLE_NOTICE, noticeVersion: "sample", source: SAMPLE_NOTICE },
      createdAt,
    });
    if (status === "new") continue;
    await updateLead(db, actor, lead.id, { assignedToId: salesId });
    await updateLead(db, actor, lead.id, { status, note: "Sample follow-up for the preview." });
    // Responses in the sample land between 6 minutes and about 3 hours after the enquiry.
    await db.update(leads).set({ firstResponseAt: new Date(createdAt.getTime() + (6 + ((i * 37) % 180)) * 60_000) }).where(eq(leads.id, lead.id));
  }

  // Keep the bell meaningful: only the newest few sample alerts stay unread. Alerts from before this run are untouched.
  const ours = and(eq(notifications.organisationId, orgId), gte(notifications.createdAt, startedAt));
  const keep = await db.select({ id: notifications.id }).from(notifications).where(ours).orderBy(desc(notifications.createdAt)).limit(3);
  const all = await db.select({ id: notifications.id }).from(notifications).where(ours);
  const readIds = all.map((n) => n.id).filter((id) => !keep.some((k) => k.id === id));
  if (readIds.length) await db.update(notifications).set({ readAt: new Date() }).where(inArray(notifications.id, readIds));
  return true;
}
