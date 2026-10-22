import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { campaignApprovals, campaigns as campaignsTable } from "@/server/db/schema";
import * as campaigns from "@/server/services/campaigns";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { actorFor, addMember, expectDbError, makeTenant, makeUser, readyCampaign } from "./helpers";

async function reviewHash(id: string) {
  const full = await campaigns.loadCampaign(getDb(), id);
  return campaigns.hashSnapshot(campaigns.configSnapshot(full!));
}

describe("campaign drafts", () => {
  it("creates a draft from a template with dealership details filled in", async () => {
    const db = getDb();
    const t = await makeTenant("Alpha");
    const [tpl] = (await campaigns.listTemplates(db, t.actor, t.org.id)).filter((x) => x.category === "test_drive");
    const c = await campaigns.createDraft(db, t.actor, t.org.id, { dealershipId: t.dealer.id, primaryLocationId: t.location.id, name: "Diwali drives", objective: "test_drive_enquiries", templateId: tpl.id });
    const full = await campaigns.loadCampaign(db, c.id);
    expect(full!.creative!.primaryText).toContain("Alpha Motors");
    expect(full!.creative!.primaryText).toContain("{model}"); // left for the user to fill
    expect(full!.targets[0].targeting.radiusKm).toBe(5);
    const r = await campaigns.checkReadiness(db, full!);
    expect(r.blockers.map((b) => b.key)).toEqual(expect.arrayContaining(["no_platforms", "dates", "placeholders"]));
  });

  it("rejects unsupported objective and platform combinations", async () => {
    const db = getDb();
    const t = await makeTenant("Alpha");
    const c = await campaigns.createDraft(db, t.actor, t.org.id, { dealershipId: t.dealer.id, primaryLocationId: t.location.id, name: "Event", objective: "dealership_event" });
    await expect(campaigns.setPlatforms(db, t.actor, c.id, { providers: ["google"] })).rejects.toThrow(/Google Ads cannot run this objective/);
    await campaigns.setPlatforms(db, t.actor, c.id, { providers: ["meta"] });
    const full = await campaigns.loadCampaign(db, c.id);
    expect(full!.platforms[0].platform.providerCampaignType).toBe("OUTCOME_AWARENESS");
  });

  it("validates targeting radius, age and PIN codes", async () => {
    const db = getDb();
    const t = await makeTenant("Alpha");
    const c = await campaigns.createDraft(db, t.actor, t.org.id, { dealershipId: t.dealer.id, primaryLocationId: t.location.id, name: "x", objective: "website_traffic" });
    const base = { ageMin: 18, ageMax: 65, languages: [], placements: "automatic", keywords: "" };
    await expect(campaigns.updateTargeting(db, t.actor, c.id, { ...base, targets: [{ locationId: t.location.id, radiusKm: 120, includePincodes: "", excludePincodes: "" }] })).rejects.toThrow(/80 km/);
    await expect(campaigns.updateTargeting(db, t.actor, c.id, { ...base, ageMin: 16, targets: [{ locationId: t.location.id, radiusKm: 5, includePincodes: "", excludePincodes: "" }] })).rejects.toThrow(/18/);
    await expect(campaigns.updateTargeting(db, t.actor, c.id, { ...base, targets: [{ locationId: t.location.id, radiusKm: 5, includePincodes: "12345", excludePincodes: "" }] })).rejects.toThrow(/6 digits/);
  });

  it("enforces budget limits and the maximum authorised spend", async () => {
    const db = getDb();
    const t = await makeTenant("Alpha");
    const c = await readyCampaign(t);
    const full = await campaigns.loadCampaign(db, c.id);
    const key = `${full!.platforms[0].platform.id}:${t.location.id}`;
    await expect(
      campaigns.updateBudget(db, t.actor, c.id, { startDate: "2030-01-01", endDate: "2030-01-31", maxAuthorisedSpend: "5000", alertThresholdPct: "80", allocations: { [key]: { lifetime: "10000", daily: "" } } }),
    ).rejects.toThrow(/exceeds the maximum authorised spend/);
    await expect(
      campaigns.updateBudget(db, t.actor, c.id, { startDate: "2030-01-31", endDate: "2030-01-01", maxAuthorisedSpend: "50000", alertThresholdPct: "80", allocations: { [key]: { lifetime: "10000", daily: "" } } }),
    ).rejects.toThrow(/End date/);
    await expect(
      campaigns.updateBudget(db, t.actor, c.id, { startDate: "2030-01-01", endDate: "2030-01-31", maxAuthorisedSpend: "50000", alertThresholdPct: "80", allocations: { [key]: { lifetime: "100.555", daily: "" } } }),
    ).rejects.toThrow(/2 decimal/);
  });

  it("flags creative problems for each platform", async () => {
    const db = getDb();
    const t = await makeTenant("Alpha");
    const c = await readyCampaign(t, { providers: ["meta", "google"] });
    await campaigns.updateCreative(db, t.actor, c.id, {
      headline: "Guaranteed loan approval on every car",
      primaryText: "Lowest price in town",
      headlines: "Only one headline",
      descriptions: "",
      callToAction: "LEARN_MORE",
      landingUrl: "",
      assetIds: [],
    });
    const r = await campaigns.checkReadiness(db, (await campaigns.loadCampaign(db, c.id))!);
    const keys = r.blockers.map((b) => b.key);
    expect(keys).toEqual(expect.arrayContaining(["landing_url", "google_headlines", "google_descriptions"]));
    expect(r.blockers.some((b) => /guaranteed finance/i.test(b.message))).toBe(true);
    expect(r.warnings.some((w) => /Superlative/.test(w.message))).toBe(true);
  });

  it("does not let other tenants or read-only users edit", async () => {
    const db = getDb();
    const a = await makeTenant("Alpha");
    const b = await makeTenant("Bravo", { lat: 28.6, lng: 77.2 });
    const c = await readyCampaign(a);
    await expect(campaigns.getCampaign(db, b.actor, c.id)).rejects.toBeInstanceOf(NotFoundError);
    const analyst = await makeUser();
    await addMember(a.org.id, analyst.id, "analyst");
    const an = await actorFor(analyst.id, a.org.id);
    await expect(campaigns.updateCreative(db, an, c.id, {})).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("approval workflow", () => {
  it("requires a different approver, binds approval to the configuration, and locks edits", async () => {
    const db = getDb();
    const t = await makeTenant("Alpha");
    const marketer = await makeUser();
    await addMember(t.org.id, marketer.id, "marketing_manager");
    const mk = await actorFor(marketer.id, t.org.id);
    const c = await readyCampaign(t);
    await campaigns.submitForApproval(db, t.actor, c.id);
    const hash = await reviewHash(c.id);
    // The owner submitted; another approver exists, so the owner cannot self-approve.
    await expect(campaigns.approve(db, t.actor, c.id, { confirmBudget: true, confirmClaims: true, expectedHash: hash })).rejects.toThrow(/other than the person who submitted/);
    // Approval must explicitly confirm the budget and match the reviewed configuration.
    await expect(campaigns.approve(db, mk, c.id, { confirmBudget: false, expectedHash: hash })).rejects.toThrow(/Confirm the maximum spend/);
    await expect(campaigns.approve(db, mk, c.id, { confirmBudget: true, confirmClaims: true, expectedHash: "0".repeat(64) })).rejects.toThrow(/changed after you opened/);
    const res = await campaigns.approve(db, mk, c.id, { confirmBudget: true, confirmClaims: true, expectedHash: hash });
    expect(res.status).toBe("ready_to_publish");
    expect(res.funding.mode).toBe("dealer_funded");
    expect(res.approval.approvedBudget).toBe(10000_00);
    await expect(campaigns.updateCreative(db, t.actor, c.id, {})).rejects.toThrow(/can no longer be edited/);
    // Approval records are immutable.
    await expectDbError(db.update(campaignApprovals).set({ note: "x" }).where(eq(campaignApprovals.id, res.approval.id)), /append-only/);
  });

  it("allows a sole approver to approve their own submission and records it", async () => {
    const db = getDb();
    const t = await makeTenant("Solo");
    const c = await readyCampaign(t);
    await campaigns.submitForApproval(db, t.actor, c.id);
    const res = await campaigns.approve(db, t.actor, c.id, { confirmBudget: true, confirmClaims: true, expectedHash: await reviewHash(c.id) });
    expect(res.approval.note).toMatch(/sole approver/);
  });

  it("blocks publishing when the configuration no longer matches the approval", async () => {
    const db = getDb();
    const t = await makeTenant("Solo");
    const c = await readyCampaign(t);
    await campaigns.submitForApproval(db, t.actor, c.id);
    await campaigns.approve(db, t.actor, c.id, { confirmBudget: true, confirmClaims: true, expectedHash: await reviewHash(c.id) });
    // Simulate someone changing the budget directly after approval.
    await db.update(campaignsTable).set({ maxAuthorisedSpend: 99_999_00 }).where(eq(campaignsTable.id, c.id));
    const full = await campaigns.loadCampaign(db, c.id);
    await expect(campaigns.assertPublishable(db, full!)).rejects.toThrow(/changed after approval/);
  });

  it("request changes reopens the draft; managed campaigns need ops sign-off", async () => {
    const db = getDb();
    const t = await makeTenant("Solo");
    const c = await readyCampaign(t);
    await campaigns.submitForApproval(db, t.actor, c.id);
    await campaigns.requestChanges(db, t.actor, c.id, { reason: "Change the headline" });
    let full = await campaigns.loadCampaign(db, c.id);
    expect(full!.campaign.status).toBe("changes_requested");
    await campaigns.submitForApproval(db, t.actor, c.id);
    await db.update(campaignsTable).set({ managed: true }).where(eq(campaignsTable.id, c.id));
    await campaigns.approve(db, t.actor, c.id, { confirmBudget: true, confirmClaims: true, expectedHash: await reviewHash(c.id) });
    full = await campaigns.loadCampaign(db, c.id);
    await expect(campaigns.assertPublishable(db, full!)).rejects.toThrow(/operations sign-off/);
    const ops = await actorFor((await makeUser({ platformRole: "campaign_ops" })).id);
    await campaigns.internalApprove(db, ops, c.id, "Checked targeting");
    full = await campaigns.loadCampaign(db, c.id);
    await expect(campaigns.assertPublishable(db, full!)).resolves.toBeTruthy();
  });

  it("enforces location monthly budget limits at approval", async () => {
    const db = getDb();
    const t = await makeTenant("Solo");
    const { locations } = await import("@/server/db/schema");
    await db.update(locations).set({ monthlyBudgetLimit: 2000_00 }).where(eq(locations.id, t.location.id));
    const c = await readyCampaign(t, { budgetRupees: 50000 });
    await campaigns.submitForApproval(db, t.actor, c.id);
    await expect(campaigns.approve(db, t.actor, c.id, { confirmBudget: true, confirmClaims: true, expectedHash: await reviewHash(c.id) })).rejects.toThrow(/monthly budget limit/);
  });

  it("derives overall status from per-platform provider statuses", () => {
    expect(campaigns.deriveStatus(["active", "active"])).toBe("active");
    expect(campaigns.deriveStatus(["active", "failed"])).toBe("partially_published");
    expect(campaigns.deriveStatus(["pending_review", "active"])).toBe("publishing");
    expect(campaigns.deriveStatus(["demo", "demo"])).toBe("demo_published");
    expect(campaigns.deriveStatus(["rejected", "failed"])).toBe("failed");
    expect(campaigns.deriveStatus(["queued", "active"])).toBe("publishing");
  });
});
