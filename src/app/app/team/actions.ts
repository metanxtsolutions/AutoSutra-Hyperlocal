"use server";

import { checkbox, formObject, runAction, type ActionState } from "@/server/actions";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import * as org from "@/server/services/organisations";

export async function inviteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await requireOrgActor();
    await org.inviteMember(getDb(), actor, actor.membership.organisationId, formObject(fd));
    return `Invitation sent to ${fd.get("email")}`;
  });
}

export async function updateMemberAction(membershipId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await requireOrgActor();
    await org.updateMember(getDb(), actor, actor.membership.organisationId, membershipId, {
      role: fd.get("role"),
      allLocations: !checkbox(fd, "limitLocations"),
      locationIds: fd.getAll("locationIds").map(String),
    });
    return "Access updated";
  });
}

export async function removeMemberAction(membershipId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await requireOrgActor();
    await org.removeMember(getDb(), actor, actor.membership.organisationId, membershipId);
    return "Member removed";
  });
}
