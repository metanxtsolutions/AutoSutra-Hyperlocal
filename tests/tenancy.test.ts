import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import * as dealerSvc from "@/server/services/dealerships";
import * as orgSvc from "@/server/services/organisations";
import { NotFoundError, ForbiddenError } from "@/server/errors";
import { actorFor, addMember, makeTenant, makeUser } from "./helpers";

const locationInput = (over: Record<string, unknown> = {}) => ({
  name: "Andheri Showroom",
  kind: "showroom",
  address: "Link Road",
  city: "Mumbai",
  state: "Maharashtra",
  pincode: "400053",
  latitude: "19.1197",
  longitude: "72.8468",
  defaultRadiusKm: "3",
  permittedPincodes: "400053, 400058",
  excludedPincodes: "",
  ...over,
});

describe("tenant isolation", () => {
  it("hides other organisations' dealerships and locations", async () => {
    const db = getDb();
    const a = await makeTenant("Alpha");
    const b = await makeTenant("Bravo", { lat: 28.61, lng: 77.2 });
    await expect(dealerSvc.getDealership(db, a.actor, b.dealer.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(dealerSvc.getLocation(db, a.actor, b.location.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(dealerSvc.listDealerships(db, a.actor, b.org.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(dealerSvc.updateDealership(db, a.actor, b.dealer.id, {})).rejects.toBeInstanceOf(NotFoundError);
    const mine = await dealerSvc.listDealerships(db, a.actor, a.org.id);
    expect(mine.map((d) => d.id)).toEqual([a.dealer.id]);
  });

  it("lets platform staff view all tenants but not manage them without admin rights", async () => {
    const db = getDb();
    const a = await makeTenant("Alpha");
    const ops = await makeUser({ platformRole: "campaign_ops" });
    const opsActor = await actorFor(ops.id);
    expect((await dealerSvc.listDealerships(db, opsActor, a.org.id)).length).toBe(1);
    await expect(dealerSvc.createLocation(db, opsActor, a.dealer.id, locationInput())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("enforces roles within an organisation", async () => {
    const db = getDb();
    const a = await makeTenant("Alpha");
    const analyst = await makeUser();
    await addMember(a.org.id, analyst.id, "analyst");
    const analystActor = await actorFor(analyst.id, a.org.id);
    expect((await dealerSvc.listDealerships(db, analystActor, a.org.id)).length).toBe(1);
    await expect(dealerSvc.createLocation(db, analystActor, a.dealer.id, locationInput())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(orgSvc.inviteMember(db, analystActor, a.org.id, { email: "x@example.test", role: "admin" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("limits location-scoped users to their assigned locations", async () => {
    const db = getDb();
    const a = await makeTenant("Alpha");
    const second = await dealerSvc.createLocation(db, a.actor, a.dealer.id, locationInput({ latitude: "18.52", longitude: "73.85", city: "Pune", pincode: "411001" }));
    const branch = await makeUser();
    const m = await addMember(a.org.id, branch.id, "branch_manager");
    await orgSvc.updateMember(db, a.actor, a.org.id, m.id, { role: "branch_manager", allLocations: false, locationIds: [second.id] });
    const branchActor = await actorFor(branch.id, a.org.id);
    const visible = await dealerSvc.listLocations(db, branchActor, a.org.id);
    expect(visible.map((v) => v.location.id)).toEqual([second.id]);
    await expect(dealerSvc.getLocation(db, branchActor, a.location.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keeps at least one owner", async () => {
    const db = getDb();
    const a = await makeTenant("Alpha");
    const team = await orgSvc.listTeam(db, a.actor, a.org.id);
    const ownerMembership = team.members[0].membership;
    await expect(orgSvc.updateMember(db, a.actor, a.org.id, ownerMembership.id, { role: "admin", allLocations: true, locationIds: [] })).rejects.toThrow(/at least one owner/);
  });
});

describe("locations", () => {
  it("validates Indian address fields, coordinates and radius", async () => {
    const db = getDb();
    const a = await makeTenant("Alpha");
    await expect(dealerSvc.createLocation(db, a.actor, a.dealer.id, locationInput({ pincode: "12345" }))).rejects.toThrow();
    await expect(dealerSvc.createLocation(db, a.actor, a.dealer.id, locationInput({ latitude: "51.5" }))).rejects.toThrow();
    await expect(dealerSvc.createLocation(db, a.actor, a.dealer.id, locationInput({ defaultRadiusKm: "120" }))).rejects.toThrow();
  });

  it("warns about overlapping territories and requires an admin override with a reason", async () => {
    const db = getDb();
    const a = await makeTenant("Alpha"); // at 19.076, 72.8777 with 5 km
    const b = await makeTenant("Bravo", { lat: 19.2, lng: 72.97 });
    const near = locationInput({ latitude: "19.08", longitude: "72.88", defaultRadiusKm: "5" });
    await expect(dealerSvc.createLocation(db, a.actor, a.dealer.id, near)).rejects.toThrow(/overlaps/);
    const loc = await dealerSvc.createLocation(db, a.actor, a.dealer.id, { ...near, overlapOverrideReason: "Second showroom in the same catchment by design" });
    expect(loc.id).toBeTruthy();
    // Overlap with another organisation is reported without revealing its name.
    const overlaps = await dealerSvc.findOverlaps(db, b.org.id, { lat: 19.08, lng: 72.88, radiusKm: 5 });
    expect(overlaps.every((o) => !o.sameOrganisation && o.locationName === "Another dealer's territory")).toBe(true);
  });
});
