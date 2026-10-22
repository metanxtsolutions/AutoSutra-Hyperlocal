"use server";

import { checkbox, formObject, runAction, type ActionState } from "@/server/actions";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { requestManagedService, updateBusinessDetails } from "@/server/services/organisations";

export async function businessDetailsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await requireOrgActor();
    await updateBusinessDetails(getDb(), actor, actor.membership.organisationId, formObject(fd));
    return "Business details saved. AutoSutra will review them for verification.";
  });
}

export async function managedServiceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await requireOrgActor();
    await requestManagedService(getDb(), actor, actor.membership.organisationId, checkbox(fd, "requested"));
    return "Saved";
  });
}
