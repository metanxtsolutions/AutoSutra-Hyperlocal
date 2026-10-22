"use server";

import { revalidatePath } from "next/cache";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { markRead } from "@/server/services/notifications";

export async function markAllReadAction() {
  const actor = await requireOrgActor();
  await markRead(getDb(), actor, actor.membership.organisationId);
  revalidatePath("/app", "layout");
}
