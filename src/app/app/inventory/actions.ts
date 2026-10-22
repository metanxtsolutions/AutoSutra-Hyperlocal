"use server";

import { formObject, runAction, type ActionState } from "@/server/actions";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { upsertInventoryItem } from "@/server/services/inventory";

export async function saveItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await requireOrgActor();
    await upsertInventoryItem(getDb(), actor, actor.membership.organisationId, formObject(fd));
    return "Saved";
  });
}
