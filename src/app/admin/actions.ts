"use server";

import { checkbox, formObject, runAction, type ActionState } from "@/server/actions";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { setFlag, putSetting, FLAG_DEFINITIONS, type FlagKey } from "@/server/flags";
import * as admin from "@/server/services/admin";
import * as orgs from "@/server/services/organisations";
import * as campaigns from "@/server/services/campaigns";
import * as publishing from "@/server/services/publishing";
import * as wallet from "@/server/services/wallet";
import * as recon from "@/server/services/reconciliation";
import * as billing from "@/server/services/billing";
import * as support from "@/server/services/support";
import * as mfa from "@/server/services/mfa";
import { checkConnection } from "@/server/services/connections";
import { ValidationError } from "@/server/errors";
import type { PlatformRole } from "@/server/auth/permissions";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function verifyOrgAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await orgs.setVerification(getDb(), await requireActor(), id, s(fd, "status") as "verified" | "rejected" | "pending", s(fd, "note"));
    return "Verification updated";
  });
}

export async function suspendOrgAction(id: string, suspend: boolean, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await orgs.setSuspended(getDb(), await requireActor(), id, suspend, s(fd, "reason"));
    return suspend ? "Organisation suspended" : "Organisation reinstated";
  });
}

export async function managedServiceAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await orgs.setManagedServiceActive(getDb(), await requireActor(), id, checkbox(fd, "active"));
    return "Saved";
  });
}

export async function serviceInvoiceAction(orgId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const inv = await billing.issueServiceInvoice(getDb(), await requireActor(), orgId, formObject(fd));
    return `Issued invoice ${inv.number}`;
  });
}

export async function discountAction(subscriptionId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await billing.setDiscount(getDb(), await requireActor(), subscriptionId, Math.round(Number(s(fd, "percent")) * 100), s(fd, "reason"));
    return "Discount saved";
  });
}

export async function userStatusAction(userId: string, status: "active" | "suspended", _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await admin.setUserStatus(getDb(), await requireActor(), userId, status, s(fd, "reason"));
    return "Saved";
  });
}

export async function resetTwoStepAction(userId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await mfa.adminResetTwoStep(getDb(), await requireActor(), userId, s(fd, "reason"));
    return "Two-step verification reset. The user has been signed out everywhere.";
  });
}

export async function platformRoleAction(userId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await admin.setPlatformRole(getDb(), await requireActor(), userId, (s(fd, "role") || null) as PlatformRole | null, s(fd, "reason"));
    return "Staff role saved";
  });
}

// Campaign operations
export async function internalApproveAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await campaigns.internalApprove(getDb(), await requireActor(), id, s(fd, "note"));
    return "Internal sign-off recorded";
  });
}
export async function opsRequestChangesAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await campaigns.requestChanges(getDb(), await requireActor(), id, { reason: s(fd, "reason") });
    return "Revision requested from the customer";
  });
}
export async function opsPublishAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await publishing.requestPublish(getDb(), await requireActor(), id);
    return "Publishing queued";
  });
}
export async function opsPauseAction(platformId: string, paused: boolean, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await publishing.setPlatformPaused(getDb(), await requireActor(), platformId, paused);
    return paused ? "Pause sent" : "Resume sent";
  });
}
export async function opsNoteAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await campaigns.addNote(getDb(), await requireActor(), id, s(fd, "kind") === "optimisation" ? "optimisation" : "internal_note", s(fd, "body"));
    return "Note added";
  });
}
export async function opsManagedAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await campaigns.setManaged(getDb(), await requireActor(), id, checkbox(fd, "managed"), s(fd, "managerId") || null);
    return "Saved";
  });
}

// Jobs & connections
export async function retryJobAction(jobId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await admin.retryJob(getDb(), await requireActor(), jobId);
    return "Job re-queued";
  });
}
export async function checkConnectionAction(connectionId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await requireActor();
    if (!actor.user.platformRole) throw new ValidationError("Staff only");
    return `Status: ${await checkConnection(getDb(), connectionId)}`;
  });
}

// Finance
export async function refundDecisionAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await wallet.decideRefund(getDb(), await requireActor(), id, formObject(fd));
    return "Decision recorded";
  });
}
export async function refundBankAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await wallet.completeRefundByBank(getDb(), await requireActor(), id, s(fd, "reference"));
    return "Refund completed";
  });
}
export async function refundFailAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await wallet.markRefundFailed(getDb(), await requireActor(), id, s(fd, "reason"));
    return "Refund marked failed; funds returned to the customer's available balance";
  });
}
export async function providerPaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await wallet.recordProviderPayment(getDb(), await requireActor(), s(fd, "provider") === "google" ? "google" : "meta", fd.get("amount"), s(fd, "reference"));
    return "Provider payment recorded";
  });
}
export async function settlementAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await wallet.recordSettlement(getDb(), await requireActor(), s(fd, "kind") === "operating" ? "operating" : "client", fd.get("amount"), s(fd, "reference"));
    return "Settlement recorded";
  });
}
export async function runReconAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await requireActor();
    if (!actor.user.platformRole) throw new ValidationError("Staff only");
    const r = await recon.runReconciliation(getDb(), actor);
    return `Reconciliation complete: ${r.summary.differences} difference(s), ${r.summary.newDifferences} new`;
  });
}
export async function proposeAdjustmentAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await recon.proposeAdjustment(getDb(), await requireActor(), id, formObject(fd));
    return "Adjustment proposed. A different finance user must approve it.";
  });
}
export async function approveAdjustmentAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await recon.approveAdjustment(getDb(), await requireActor(), id);
    return "Adjustment approved and posted";
  });
}
export async function resolveDiffAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await recon.resolveDifference(getDb(), await requireActor(), id, s(fd, "note"));
    return "Resolved";
  });
}
export async function voidInvoiceAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await billing.voidInvoice(getDb(), await requireActor(), id, s(fd, "reason"));
    return "Invoice voided";
  });
}

// Plans, flags, settings
export async function savePlanAction(planId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await billing.savePlan(getDb(), await requireActor(), planId, { ...formObject(fd), isPublic: checkbox(fd, "isPublic"), isActive: checkbox(fd, "isActive") });
    return "Plan saved";
  });
}
export async function flagAction(key: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    if (!(key in FLAG_DEFINITIONS)) throw new ValidationError("Unknown flag");
    if (s(fd, "confirm") !== key) throw new ValidationError(`Type ${key} to confirm`);
    await setFlag(getDb(), await requireActor(), key as FlagKey, checkbox(fd, "enabled"), s(fd, "reason"));
    return "Flag updated";
  });
}
export async function settingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await requireActor();
    const db = getDb();
    const days = Number(s(fd, "leadRetentionDays"));
    if (!Number.isInteger(days) || days < 30 || days > 3650) throw new ValidationError("Retention must be between 30 and 3,650 days");
    await putSetting(db, actor, "supplier_state", s(fd, "supplierState"));
    await putSetting(db, actor, "supplier_details", { name: s(fd, "supplierName"), address: s(fd, "supplierAddress"), gstin: s(fd, "supplierGstin") });
    await putSetting(db, actor, "lead_retention_days", days);
    return "Settings saved";
  });
}

// Support & contacts
export async function staffReplyAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await support.replyToTicket(getDb(), await requireActor(), id, s(fd, "body"), { internal: checkbox(fd, "internal"), status: s(fd, "status") || undefined });
    return "Saved";
  });
}
export async function contactStatusAction(id: string, status: "contacted" | "closed", _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await admin.setContactStatus(getDb(), await requireActor(), id, status);
    return "Updated";
  });
}
