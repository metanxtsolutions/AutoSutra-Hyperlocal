"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { formObject, runAction, type ActionState } from "@/server/actions";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { requestRefund, startDeposit } from "@/server/services/wallet";

export async function depositAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let paymentId = "";
  const r = await runAction(fd, async () => {
    const actor = await requireOrgActor();
    const { payment } = await startDeposit(getDb(), actor, actor.membership.organisationId, { amount: fd.get("amount"), requestKey: String(fd.get("requestKey") || randomUUID()) });
    paymentId = payment.id;
  });
  if (r.ok) redirect(`/pay/${paymentId}`);
  return r;
}

export async function refundAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await requireOrgActor();
    await requestRefund(getDb(), actor, actor.membership.organisationId, formObject(fd));
    return "Refund requested. AutoSutra finance will review it.";
  });
}
