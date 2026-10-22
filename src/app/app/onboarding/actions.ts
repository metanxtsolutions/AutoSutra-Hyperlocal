"use server";

import { redirect } from "next/navigation";
import { formObject, runAction, type ActionState } from "@/server/actions";
import { currentSession, requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { switchOrganisation } from "@/server/services/auth";
import { createOrganisation } from "@/server/services/organisations";

export async function createOrganisationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await runAction(fd, async () => {
    const actor = await requireActor();
    const s = await currentSession();
    const db = getDb();
    const org = await createOrganisation(db, actor, formObject(fd));
    if (s) await switchOrganisation(db, s.session.id, actor.user.id, org.id);
  });
  if (result.ok) redirect("/app/onboarding?notice=" + encodeURIComponent("Organisation created. Next, add your business details."));
  return result;
}
