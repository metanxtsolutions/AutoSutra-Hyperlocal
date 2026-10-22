"use server";

import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/server/actions";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { cancelSubscription, payInvoice, resumeSubscription, startSubscription } from "@/server/services/billing";

export async function choosePlanAction(planId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await requireOrgActor();
    await startSubscription(getDb(), actor, actor.membership.organisationId, planId);
    return "Subscription updated";
  });
}

export async function cancelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await requireOrgActor();
    await cancelSubscription(getDb(), actor, actor.membership.organisationId, String(fd.get("reason") ?? ""));
    return "Your subscription will end at the end of the current period.";
  });
}

export async function resumeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await requireOrgActor();
    await resumeSubscription(getDb(), actor, actor.membership.organisationId);
    return "Cancellation withdrawn";
  });
}

export async function payInvoiceAction(invoiceId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await runAction(fd, async () => {
    id = (await payInvoice(getDb(), await requireOrgActor(), invoiceId)).id;
  });
  if (r.ok) redirect(`/pay/${id}`);
  return r;
}
