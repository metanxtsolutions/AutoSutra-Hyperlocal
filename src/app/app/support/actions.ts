"use server";

import { redirect } from "next/navigation";
import { formObject, runAction, type ActionState } from "@/server/actions";
import { requireActor, requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { createTicket, replyToTicket } from "@/server/services/support";

export async function createTicketAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await runAction(fd, async () => {
    const actor = await requireOrgActor();
    id = (await createTicket(getDb(), actor, actor.membership.organisationId, formObject(fd))).id;
  });
  if (r.ok) redirect(`/app/support/${id}`);
  return r;
}

export async function replyAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await replyToTicket(getDb(), await requireActor(), id, String(fd.get("body") ?? ""), { internal: fd.get("internal") === "on", status: String(fd.get("status") ?? "") || undefined });
    return "Reply sent";
  });
}
