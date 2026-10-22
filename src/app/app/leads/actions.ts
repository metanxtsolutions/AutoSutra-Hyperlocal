"use server";

import { redirect } from "next/navigation";
import { checkbox, formObject, runAction, type ActionState } from "@/server/actions";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { ValidationError } from "@/server/errors";
import * as leads from "@/server/services/leads";

export async function createLeadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await runAction(fd, async () => {
    const actor = await requireOrgActor();
    const out = await leads.createManualLead(getDb(), actor, actor.membership.organisationId, { ...formObject(fd), consentConfirmed: checkbox(fd, "consentConfirmed") });
    id = out.lead.id;
  });
  if (r.ok) redirect(`/app/leads/${id}`);
  return r;
}

export async function importAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await requireOrgActor();
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ValidationError("Choose a CSV file");
    if (file.size > 2 * 1024 * 1024) throw new ValidationError("CSV files must be under 2 MB");
    const r = await leads.importLeadsCsv(getDb(), actor, actor.membership.organisationId, String(fd.get("locationId") ?? ""), await file.text());
    return `Imported ${r.created} lead(s), ${r.duplicates} duplicate(s).${r.skipped.length ? ` Skipped: ${r.skipped.slice(0, 5).join("; ")}${r.skipped.length > 5 ? "…" : ""}` : ""}`;
  });
}

export async function updateLeadAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const data = formObject(fd);
    if (!fd.has("assignedToId")) delete data.assignedToId;
    await leads.updateLead(getDb(), await requireOrgActor(), id, data);
    return "Lead updated";
  });
}

export async function withdrawConsentAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await leads.withdrawConsent(getDb(), await requireOrgActor(), id);
    return "Consent withdrawn and personal data removed";
  });
}

export async function anonymiseAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const reason = String(fd.get("reason") ?? "").trim();
    if (!reason) throw new ValidationError("Give a reason");
    await leads.anonymiseLead(getDb(), await requireOrgActor(), id, reason);
    return "Personal data removed";
  });
}
