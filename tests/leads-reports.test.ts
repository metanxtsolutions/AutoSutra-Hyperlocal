import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { campaignPlatforms, campaigns as campaignsTable, consentRecords, leads, locations, metricSnapshots, notifications } from "@/server/db/schema";
import * as leadSvc from "@/server/services/leads";
import { buildReport, normaliseFilter } from "@/server/services/reports";
import { runAutomationScan } from "@/server/services/automation";
import { csvCell } from "@/lib/csv";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { actorFor, addMember, makeTenant, makeUser, readyCampaign } from "./helpers";

const enquiry = (locationId: string, over: Record<string, unknown> = {}) => ({ locationId, name: "Ravi Kumar", phone: "98765 43210", vehicleModel: "Nexon", consent: true, ...over });

describe("lead capture", () => {
  it("captures public enquiries with a consent record and routes them", async () => {
    const db = getDb();
    const t = await makeTenant("Alpha");
    const sales = await makeUser({ name: "Priya Sales" });
    await addMember(t.org.id, sales.id, "sales_user");
    await db.update(locations).set({ leadRoutingUserId: sales.id }).where(eq(locations.id, t.location.id));
    await expect(leadSvc.submitPublicEnquiry(db, enquiry(t.location.id, { consent: false }), "9.9.9.9")).rejects.toThrow(/agree to be contacted/);
    await expect(leadSvc.submitPublicEnquiry(db, enquiry(t.location.id, { phone: "12345" }), "9.9.9.9")).rejects.toThrow(/valid Indian mobile/);
    const { lead } = await leadSvc.submitPublicEnquiry(db, enquiry(t.location.id), "9.9.9.9");
    expect(lead).toMatchObject({ phoneNormalized: "+919876543210", status: "assigned", assignedToId: sales.id, consentGiven: true });
    const [consent] = await db.select().from(consentRecords).where(eq(consentRecords.leadId, lead.id));
    expect(consent.noticeText).toContain("Alpha Motors");
    expect(consent.noticeVersion).toBe(leadSvc.CONSENT_NOTICE_VERSION);
  });

  it("detects duplicates within 30 days and links them to the original", async () => {
    const db = getDb();
    const t = await makeTenant("Alpha");
    const first = await leadSvc.submitPublicEnquiry(db, enquiry(t.location.id), "1.1.1.1");
    const second = await leadSvc.submitPublicEnquiry(db, enquiry(t.location.id, { phone: "+91 9876543210", message: "Still interested" }), "1.1.1.2");
    expect(second.duplicate).toBe(true);
    expect(second.lead.duplicateOfId).toBe(first.lead.id);
    const list = await leadSvc.listLeads(db, t.actor, t.org.id);
    expect(list).toHaveLength(1); // duplicates hidden by default
    const detail = await leadSvc.getLead(db, t.actor, first.lead.id);
    expect(detail.duplicates).toHaveLength(1);
  });

  it("rate limits the public form per IP", async () => {
    const db = getDb();
    const t = await makeTenant("Alpha");
    for (let i = 0; i < 10; i++) await leadSvc.submitPublicEnquiry(db, enquiry(t.location.id, { phone: `98765432${String(i).padStart(2, "0")}` }), "7.7.7.7");
    await expect(leadSvc.submitPublicEnquiry(db, enquiry(t.location.id, { phone: "9876500000" }), "7.7.7.7")).rejects.toThrow(/Too many/);
  });

  it("tracks status history, first response and enforces assignment permissions", async () => {
    const db = getDb();
    const t = await makeTenant("Alpha");
    const { lead } = await leadSvc.submitPublicEnquiry(db, enquiry(t.location.id), "1.1.1.1");
    const sales = await makeUser();
    await addMember(t.org.id, sales.id, "sales_user");
    const sa = await actorFor(sales.id, t.org.id);
    await leadSvc.updateLead(db, sa, lead.id, { status: "contacted", note: "Called, interested in AMT" });
    await expect(leadSvc.updateLead(db, sa, lead.id, { status: "test_drive_scheduled" })).rejects.toThrow(/test-drive date/);
    await leadSvc.updateLead(db, sa, lead.id, { status: "test_drive_scheduled", testDriveAt: "2030-01-05T11:00" });
    const d = await leadSvc.getLead(db, t.actor, lead.id);
    expect(d.lead.firstResponseAt).not.toBeNull();
    expect(d.activities.filter((a) => a.a.kind === "status_change").map((a) => a.a.toStatus)).toEqual(["contacted", "test_drive_scheduled"]);
    // Sales users cannot reassign leads.
    await expect(leadSvc.updateLead(db, sa, lead.id, { assignedToId: t.owner.id })).rejects.toBeInstanceOf(ForbiddenError);
    await leadSvc.updateLead(db, t.actor, lead.id, { assignedToId: sales.id });
  });

  it("isolates leads by tenant and location", async () => {
    const db = getDb();
    const a = await makeTenant("Alpha");
    const b = await makeTenant("Bravo", { lat: 28.6, lng: 77.2 });
    const { lead } = await leadSvc.submitPublicEnquiry(db, enquiry(a.location.id), "1.1.1.1");
    await expect(leadSvc.getLead(db, b.actor, lead.id)).rejects.toBeInstanceOf(NotFoundError);
    const [other] = await db.insert(locations).values({ organisationId: a.org.id, dealershipId: a.dealer.id, name: "Pune", address: "x", city: "Pune", state: "Maharashtra", pincode: "411001", latitude: 18.52, longitude: 73.85 }).returning();
    const branch = await makeUser();
    const m = await addMember(a.org.id, branch.id, "sales_user", false);
    const { membershipLocations } = await import("@/server/db/schema");
    await db.insert(membershipLocations).values({ membershipId: m.id, locationId: other.id });
    const ba = await actorFor(branch.id, a.org.id);
    expect(await leadSvc.listLeads(db, ba, a.org.id)).toHaveLength(0);
    await expect(leadSvc.getLead(db, ba, lead.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("restricts CSV export, imports with consent evidence and protects against formula injection", async () => {
    const db = getDb();
    const t = await makeTenant("Alpha");
    const sales = await makeUser();
    await addMember(t.org.id, sales.id, "sales_user");
    await expect(leadSvc.exportLeadsCsvRows(db, await actorFor(sales.id, t.org.id), t.org.id, {})).rejects.toBeInstanceOf(ForbiddenError);
    const csv = 'name,phone,email,vehicle_model,consent_source\n"Asha, R",9876543210,,Punch,Walk-in form signed 1 Oct\nNo Consent,9876543211,,,\n';
    const r = await leadSvc.importLeadsCsv(db, t.actor, t.org.id, t.location.id, csv);
    expect(r).toMatchObject({ created: 1, duplicates: 0 });
    expect(r.skipped[0]).toMatch(/consent_source/);
    expect((await leadSvc.exportLeadsCsvRows(db, t.actor, t.org.id, {}))[0].lead.name).toBe("Asha, R");
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("-1500.50")).toBe("-1500.50");
  });

  it("anonymises personal data on consent withdrawal but keeps the record", async () => {
    const db = getDb();
    const t = await makeTenant("Alpha");
    const { lead } = await leadSvc.submitPublicEnquiry(db, enquiry(t.location.id), "1.1.1.1");
    await leadSvc.withdrawConsent(db, t.actor, lead.id);
    const after = await db.query.leads.findFirst({ where: eq(leads.id, lead.id) });
    expect(after).toMatchObject({ name: null, phone: null, phoneNormalized: null, consentGiven: false });
    expect(after!.anonymisedAt).not.toBeNull();
    const [c] = await db.select().from(consentRecords).where(eq(consentRecords.leadId, lead.id));
    expect(c.withdrawnAt).not.toBeNull();
    await expect(leadSvc.updateLead(db, t.actor, lead.id, { status: "contacted" })).rejects.toThrow(/anonymised/);
  });
});

describe("reports", () => {
  it("keeps providers separate, computes cost per lead and excludes demo data", async () => {
    const db = getDb();
    const t = await makeTenant("Alpha");
    const c = await readyCampaign(t, { providers: ["meta", "google"] });
    const platforms = await db.select().from(campaignPlatforms).where(eq(campaignPlatforms.campaignId, c.id));
    const meta = platforms.find((p) => p.provider === "meta")!;
    const google = platforms.find((p) => p.provider === "google")!;
    await db.update(campaignPlatforms).set({ mode: "live", publishedAt: new Date(), lastSyncedAt: new Date() }).where(eq(campaignPlatforms.campaignId, c.id));
    await db.update(campaignsTable).set({ status: "active" }).where(eq(campaignsTable.id, c.id));
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(metricSnapshots).values([
      { campaignPlatformId: meta.id, organisationId: t.org.id, provider: "meta", metricDate: today, impressions: 10000, reach: 7000, clicks: 200, spend: 3000_00, platformConversions: 5 },
      { campaignPlatformId: google.id, organisationId: t.org.id, provider: "google", metricDate: today, impressions: 2000, reach: null, clicks: 100, spend: 2000_00, platformConversions: 2.5 },
    ]);
    for (let i = 0; i < 4; i++) {
      await leadSvc.captureLead(db, { system: "test" }, { organisationId: t.org.id, dealershipId: t.dealer.id, locationId: t.location.id, campaignId: c.id, provider: i < 3 ? "meta" : "google", source: i < 3 ? "meta_instant_form" : "website_form", phone: `98765000${i}0`, consent: { granted: true, noticeText: "x", noticeVersion: "x", source: "test" } });
    }
    const r = await buildReport(db, t.actor, t.org.id, normaliseFilter({}));
    const m = r.byProvider.find((p) => p.provider === "meta")!;
    const g = r.byProvider.find((p) => p.provider === "google")!;
    expect(m).toMatchObject({ spend: 3000_00, clicks: 200, platformConversions: 5, attributedLeads: 3, costPerLead: 1000_00 });
    expect(m.ctr).toBeCloseTo(0.02);
    expect(g).toMatchObject({ spend: 2000_00, platformConversions: 2.5, attributedLeads: 1 });
    expect(r.totals).toMatchObject({ spend: 5000_00, leads: 4 });
    expect(r.byLocation[0]).toMatchObject({ leads: 4, costPerLead: 1250_00 });
    expect(r.warnings).toHaveLength(0);
    // Stale data produces a freshness warning.
    await db.update(campaignPlatforms).set({ lastSyncedAt: new Date(Date.now() - 8 * 3600_000) }).where(eq(campaignPlatforms.id, meta.id));
    const stale = await buildReport(db, t.actor, t.org.id, normaliseFilter({}));
    expect(stale.warnings.join(" ")).toMatch(/Meta data is more than 6 hours old/);
  });

  it("requires reporting permission", async () => {
    const db = getDb();
    const t = await makeTenant("Alpha");
    const sales = await makeUser();
    await addMember(t.org.id, sales.id, "sales_user");
    await expect(buildReport(db, await actorFor(sales.id, t.org.id), t.org.id, normaliseFilter({}))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("automation", () => {
  it("alerts once per condition", async () => {
    const db = getDb();
    const t = await makeTenant("Alpha");
    const c = await readyCampaign(t);
    await db.update(campaignsTable).set({ status: "pending_approval", submittedAt: new Date(Date.now() - 48 * 3600_000) }).where(eq(campaignsTable.id, c.id));
    const r1 = await runAutomationScan(db);
    const r2 = await runAutomationScan(db);
    expect(r1.pendingApprovals).toBe(1);
    expect(r2.pendingApprovals).toBe(0);
    expect(await db.select().from(notifications).where(eq(notifications.kind, "approval_overdue"))).toHaveLength(1);
  });
});
