"use server";

import { redirect } from "next/navigation";
import { formObject, runAction, type ActionState } from "@/server/actions";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import * as svc from "@/server/services/dealerships";

export async function createDealershipAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await runAction(fd, async () => {
    const actor = await requireOrgActor();
    id = (await svc.createDealership(getDb(), actor, actor.membership.organisationId, formObject(fd))).id;
  });
  if (r.ok) redirect(`/app/dealerships/${id}?notice=${encodeURIComponent("Dealership added. Now add its locations.")}`);
  return r;
}

export async function updateDealershipAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(fd, async () => {
    await svc.updateDealership(getDb(), await requireOrgActor(), id, formObject(fd));
  });
  if (r.ok) redirect(`/app/dealerships/${id}?notice=Saved`);
  return r;
}

export async function setDealershipStatusAction(id: string, status: "active" | "inactive") {
  await svc.setDealershipStatus(getDb(), await requireOrgActor(), id, status);
  redirect(`/app/dealerships/${id}?notice=${status === "active" ? "Activated" : "Deactivated"}`);
}

export async function createLocationAction(dealershipId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(fd, async () => {
    await svc.createLocation(getDb(), await requireOrgActor(), dealershipId, formObject(fd, ["supportedObjectives"]));
  });
  if (r.ok) redirect(`/app/dealerships/${dealershipId}?notice=${encodeURIComponent("Location added")}`);
  return r;
}

export async function updateLocationAction(locationId: string, dealershipId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(fd, async () => {
    await svc.updateLocation(getDb(), await requireOrgActor(), locationId, formObject(fd, ["supportedObjectives"]));
  });
  if (r.ok) redirect(`/app/dealerships/${dealershipId}?notice=${encodeURIComponent("Location updated")}`);
  return r;
}

export async function setLocationStatusAction(locationId: string, dealershipId: string, status: "active" | "inactive") {
  await svc.setLocationStatus(getDb(), await requireOrgActor(), locationId, status);
  redirect(`/app/dealerships/${dealershipId}?notice=${status === "active" ? "Location reactivated" : "Location deactivated"}`);
}
