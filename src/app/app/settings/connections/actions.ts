"use server";

import { redirect } from "next/navigation";
import { checkbox, runAction, type ActionState } from "@/server/actions";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { configureAccount, disconnect, startOAuth } from "@/server/services/connections";

export async function connectAction(provider: "meta" | "google", _: ActionState, fd: FormData): Promise<ActionState> {
  let url = "";
  const r = await runAction(fd, async () => {
    const actor = await requireOrgActor();
    url = await startOAuth(getDb(), actor, actor.membership.organisationId, provider);
  });
  if (r.ok) redirect(url);
  return r;
}

export async function configureAccountAction(accountId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const [metaPageId, metaPageName] = String(fd.get("page") ?? "").split("|");
    await configureAccount(getDb(), await requireOrgActor(), accountId, {
      selected: checkbox(fd, "selected"),
      dealershipId: String(fd.get("dealershipId") ?? "") || null,
      metaPageId: metaPageId || null,
      metaPageName: metaPageName || null,
    });
    return "Account settings saved";
  });
}

export async function disconnectAction(provider: "meta" | "google", _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await requireOrgActor();
    await disconnect(getDb(), actor, actor.membership.organisationId, provider);
    return "Disconnected. Tokens were deleted.";
  });
}
