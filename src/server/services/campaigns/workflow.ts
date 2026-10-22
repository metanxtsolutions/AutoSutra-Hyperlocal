import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "../../db/client";
import { campaignApprovals, campaignBudgets, campaignNotes, campaignPlatforms, campaigns, organisationMemberships, users } from "../../db/schema";
import { audit } from "../../audit";
import { hasPlatform, requirePlatform, type Actor } from "../../auth/context";
import { roleHas } from "../../auth/permissions";
import { formatINR } from "@/lib/money";
import { ConflictError, ForbiddenError, ValidationError } from "../../errors";
import { optionalText, parse, requiredText } from "../../validation";
import { notify } from "../notifications";
import { releaseCampaignBudget, reserveCampaignBudget } from "../funding";
import { getCampaign, loadCampaign, totalBudget, type FullCampaign } from "./load";
import { checkReadiness } from "./readiness";
import { configSnapshot, hashSnapshot } from "./snapshot";

type Status = (typeof campaigns.$inferSelect)["status"];

async function setStatus(db: DbOrTx, id: string, from: Status[], to: Status, extra: Partial<typeof campaigns.$inferInsert> = {}) {
  const rows = await db
    .update(campaigns)
    .set({ status: to, ...extra, updatedAt: new Date() })
    .where(and(eq(campaigns.id, id), inArray(campaigns.status, from)))
    .returning({ id: campaigns.id });
  if (!rows.length) throw new ConflictError("The campaign changed while you were working. Reload and try again.");
}

// ------------------------------------------------------------------ submit

export async function submitForApproval(db: Database, actor: Actor, id: string) {
  const full = await getCampaign(db, actor, id, "campaign.submit");
  const c = full.campaign;
  if (!["draft", "changes_requested"].includes(c.status)) throw new ValidationError("Only drafts can be submitted");
  const readiness = await checkReadiness(db, full);
  if (!readiness.ready) throw new ValidationError(`Not ready to submit: ${readiness.blockers.map((b) => b.message).join(" ")}`);
  await db.transaction(async (tx) => {
    await setStatus(tx, c.id, ["draft", "changes_requested"], "pending_approval", { submittedById: actor.user.id, submittedAt: new Date() });
    await audit(tx, actor, {
      action: "campaign.submitted",
      entityType: "campaign",
      entityId: c.id,
      organisationId: c.organisationId,
      summary: `Submitted "${c.name}" for approval (${formatINR(totalBudget(full))})`,
      data: { version: c.version },
    });
    await notify(tx, {
      organisationId: c.organisationId,
      kind: "approval_needed",
      title: "Campaign waiting for approval",
      body: `"${c.name}" was submitted by ${actor.user.name} and needs approval.`,
      link: `/app/campaigns/${c.id}/review`,
      dedupeKey: `approval_needed:${c.id}:${c.version}`,
    });
    if (c.managed) {
      await notify(tx, {
        organisationId: null,
        audience: "platform",
        kind: "managed_campaign_submitted",
        title: "Managed campaign submitted",
        body: `"${c.name}" (${full.organisation.name}) is awaiting customer approval.`,
        link: `/admin/campaigns/${c.id}`,
        dedupeKey: `managed_submitted:${c.id}:${c.version}`,
      });
    }
  });
}

// ------------------------------------------------------------------ customer approval

const approveSchema = z.object({
  confirmBudget: z.literal(true, { errorMap: () => ({ message: "Confirm the maximum spend you are authorising" }) }),
  confirmClaims: z.boolean().default(false),
  note: optionalText(1000),
  expectedHash: requiredText("Configuration fingerprint", 64),
});

/** Whether anyone other than `userId` in the organisation can approve campaigns. */
async function hasOtherApprover(db: DbOrTx, organisationId: string, userId: string) {
  const members = await db
    .select({ role: organisationMemberships.role })
    .from(organisationMemberships)
    .innerJoin(users, eq(users.id, organisationMemberships.userId))
    .where(and(eq(organisationMemberships.organisationId, organisationId), ne(organisationMemberships.userId, userId), eq(users.status, "active")));
  return members.some((m) => roleHas(m.role, "campaign.approve"));
}

/**
 * Monthly budget limits per location: the approved budgets of all live or
 * approved campaigns are spread evenly over their days and summed per month.
 */
async function checkLocationLimits(db: DbOrTx, full: FullCampaign) {
  const c = full.campaign;
  if (!c.startDate || !c.endDate) return;
  for (const { location } of full.targets) {
    if (!location.monthlyBudgetLimit) continue;
    const rows = await db
      .select({ lifetime: campaignBudgets.lifetimeBudget, start: campaigns.startDate, end: campaigns.endDate, id: campaigns.id })
      .from(campaignBudgets)
      .innerJoin(campaigns, eq(campaigns.id, campaignBudgets.campaignId))
      .where(
        and(
          eq(campaignBudgets.locationId, location.id),
          inArray(campaigns.status, ["pending_funding", "ready_to_publish", "publishing", "active", "partially_published", "paused", "demo_published"]),
          ne(campaigns.id, c.id),
        ),
      );
    const mine = full.budgets.filter((b) => b.locationId === location.id).map((b) => ({ lifetime: b.lifetimeBudget, start: c.startDate!, end: c.endDate!, id: c.id }));
    const perMonth = new Map<string, number>();
    for (const r of [...rows, ...mine]) {
      if (!r.start || !r.end) continue;
      const startMs = Date.parse(`${r.start}T00:00:00Z`);
      const endMs = Date.parse(`${r.end}T00:00:00Z`);
      const totalDays = Math.round((endMs - startMs) / 86_400_000) + 1;
      for (let t = startMs; t <= endMs; t += 86_400_000) {
        const month = new Date(t).toISOString().slice(0, 7);
        perMonth.set(month, (perMonth.get(month) ?? 0) + r.lifetime / totalDays);
      }
    }
    for (const [month, amount] of perMonth) {
      if (amount > location.monthlyBudgetLimit + 1) {
        throw new ValidationError(
          `${location.name} would exceed its monthly budget limit of ${formatINR(location.monthlyBudgetLimit, { decimals: false })} in ${month} (about ${formatINR(Math.round(amount), { decimals: false })} planned). Reduce the budget or ask an admin to raise the limit.`,
        );
      }
    }
  }
}

export async function approve(db: Database, actor: Actor, id: string, input: unknown) {
  const data = parse(approveSchema, input);
  const full = await getCampaign(db, actor, id, "campaign.approve");
  const c = full.campaign;
  if (c.status !== "pending_approval") throw new ValidationError("This campaign is not waiting for approval");
  if (actor.membership?.organisationId !== c.organisationId) throw new ForbiddenError("Campaigns are approved by the customer organisation");
  const snapshot = configSnapshot(full);
  const hash = hashSnapshot(snapshot);
  if (hash !== data.expectedHash) throw new ConflictError("The campaign changed after you opened the review. Reload and review it again.");
  const readiness = await checkReadiness(db, full);
  if (!readiness.ready) throw new ValidationError(`Cannot approve: ${readiness.blockers.map((b) => b.message).join(" ")}`);
  if (c.claimsStatus === "pending" && !data.confirmClaims) {
    throw new ValidationError("Confirm the promotional claims are accurate and authorised", { confirmClaims: "Required" });
  }
  const selfApproval = c.submittedById === actor.user.id;
  if (selfApproval && (await hasOtherApprover(db, c.organisationId, actor.user.id))) {
    throw new ForbiddenError("Someone other than the person who submitted the campaign must approve it.");
  }
  await checkLocationLimits(db, full);

  return db.transaction(async (tx) => {
    // Re-check under lock: the row must still be pending and unchanged.
    const locked = await tx.execute<{ version: number; status: string }>(sql`SELECT version, status FROM campaigns WHERE id = ${c.id} FOR UPDATE`);
    if (locked.rows[0]?.status !== "pending_approval" || Number(locked.rows[0]?.version) !== c.version) {
      throw new ConflictError("The campaign changed while you were approving it. Reload and review it again.");
    }
    if (c.claimsStatus === "pending") {
      await tx.update(campaigns).set({ claimsStatus: "approved", claimsReviewedById: actor.user.id }).where(eq(campaigns.id, c.id));
      snapshot.product.claimsStatus = "approved";
    }
    const finalHash = hashSnapshot(snapshot);
    const [approval] = await tx
      .insert(campaignApprovals)
      .values({
        campaignId: c.id,
        organisationId: c.organisationId,
        stage: "customer",
        decision: "approved",
        decidedById: actor.user.id,
        note: [data.note, selfApproval ? "Self-approved: sole approver in organisation." : null].filter(Boolean).join(" ") || null,
        campaignVersion: c.version,
        approvedBudget: totalBudget(full),
        maxAuthorisedSpend: c.maxAuthorisedSpend,
        configSnapshot: snapshot,
        configHash: finalHash,
      })
      .returning();
    const funding = await reserveCampaignBudget(tx, actor, c, approval.id);
    const next: Status = funding.status === "insufficient" ? "pending_funding" : "ready_to_publish";
    await setStatus(tx, c.id, ["pending_approval"], next, { currentApprovalId: approval.id });
    await audit(tx, actor, {
      action: "campaign.approved",
      entityType: "campaign",
      entityId: c.id,
      organisationId: c.organisationId,
      summary: `Approved "${c.name}": budget ${formatINR(approval.approvedBudget)}, max spend ${formatINR(approval.maxAuthorisedSpend)}${selfApproval ? " (sole approver)" : ""}. Funding: ${funding.mode} / ${funding.status}`,
      data: { approvalId: approval.id, configHash: finalHash, version: c.version, funding },
    });
    if (next === "pending_funding") {
      await notify(tx, {
        organisationId: c.organisationId,
        kind: "funding_needed",
        severity: "warning",
        title: "Campaign approved but not funded",
        body: `"${c.name}" needs ${formatINR(funding.required)}; ${formatINR(funding.available)} is available. Add funds to the advertising wallet.`,
        link: `/app/campaigns/${c.id}`,
        dedupeKey: `funding_needed:${approval.id}`,
      });
    }
    if (c.managed) {
      await notify(tx, {
        organisationId: null,
        audience: "platform",
        kind: "managed_campaign_approved",
        title: "Managed campaign approved by customer",
        body: `"${c.name}" (${full.organisation.name}) is approved by the customer and needs internal review before launch.`,
        link: `/admin/campaigns/${c.id}`,
        dedupeKey: `managed_approved:${approval.id}`,
      });
    }
    return { approval, funding, status: next };
  });
}

/** Retry the funding step for an approved campaign waiting for funds. */
export async function retryFunding(db: Database, actor: Actor, id: string) {
  const full = await getCampaign(db, actor, id, "campaign.view");
  const c = full.campaign;
  if (c.status !== "pending_funding" || !c.currentApprovalId) throw new ValidationError("This campaign is not waiting for funds");
  return db.transaction(async (tx) => {
    const funding = await reserveCampaignBudget(tx, actor, c, c.currentApprovalId!);
    if (funding.status === "insufficient") throw new ValidationError(`Still short of funds: needs ${formatINR(funding.required)}, ${formatINR(funding.available)} available.`);
    await setStatus(tx, c.id, ["pending_funding"], "ready_to_publish");
    await audit(tx, actor, { action: "campaign.funded", entityType: "campaign", entityId: c.id, organisationId: c.organisationId, summary: `Funding reserved for "${c.name}"`, data: { funding } });
  });
}

// ------------------------------------------------------------------ changes, revocation, internal review

const reasonSchema = z.object({ reason: requiredText("Reason", 1000) });

/** Customer approver or AutoSutra ops sends the campaign back for edits. Releases any reservation. */
export async function requestChanges(db: Database, actor: Actor, id: string, input: unknown) {
  const { reason } = parse(reasonSchema, input);
  const full = await loadCampaign(db, id);
  if (!full) throw new ValidationError("Campaign not found");
  const c = full.campaign;
  const isOps = hasPlatform(actor, "platform.campaign_ops");
  if (!isOps) await getCampaign(db, actor, id, "campaign.approve");
  if (!["pending_approval", "pending_funding", "ready_to_publish"].includes(c.status)) throw new ValidationError("Changes can only be requested before publishing");
  await db.transaction(async (tx) => {
    await releaseCampaignBudget(tx, actor, c, `changes requested: ${reason}`);
    await setStatus(tx, c.id, ["pending_approval", "pending_funding", "ready_to_publish"], "changes_requested", { currentApprovalId: null });
    await tx.insert(campaignApprovals).values({
      campaignId: c.id,
      organisationId: c.organisationId,
      stage: isOps && actor.membership?.organisationId !== c.organisationId ? "internal" : "customer",
      decision: "changes_requested",
      decidedById: actor.user.id,
      note: reason,
      campaignVersion: c.version,
      configSnapshot: configSnapshot(full),
      configHash: hashSnapshot(configSnapshot(full)),
    });
    await audit(tx, actor, { action: "campaign.changes_requested", entityType: "campaign", entityId: c.id, organisationId: c.organisationId, summary: `Changes requested on "${c.name}": ${reason}` });
    await notify(tx, {
      organisationId: c.organisationId,
      kind: "changes_requested",
      title: "Changes requested",
      body: `"${c.name}": ${reason}`,
      link: `/app/campaigns/${c.id}`,
      dedupeKey: `changes_requested:${c.id}:${c.version}:${Date.now()}`,
    });
  });
}

/** AutoSutra operations sign-off for managed campaigns, after the customer's approval. */
export async function internalApprove(db: Database, actor: Actor, id: string, note: string) {
  requirePlatform(actor, "platform.campaign_ops");
  const full = await loadCampaign(db, id);
  if (!full) throw new ValidationError("Campaign not found");
  const c = full.campaign;
  if (!["ready_to_publish", "pending_funding"].includes(c.status)) throw new ValidationError("The customer must approve the campaign first");
  const customer = full.approvals.find((a) => a.id === c.currentApprovalId);
  if (!customer || customer.campaignVersion !== c.version) throw new ConflictError("Customer approval does not match the current configuration");
  await db.transaction(async (tx) => {
    await tx.insert(campaignApprovals).values({
      campaignId: c.id,
      organisationId: c.organisationId,
      stage: "internal",
      decision: "approved",
      decidedById: actor.user.id,
      note: note.trim() || null,
      campaignVersion: c.version,
      approvedBudget: customer.approvedBudget,
      maxAuthorisedSpend: customer.maxAuthorisedSpend,
      configSnapshot: customer.configSnapshot,
      configHash: customer.configHash,
    });
    await audit(tx, actor, { action: "campaign.internal_approved", entityType: "campaign", entityId: c.id, organisationId: c.organisationId, summary: `AutoSutra operations approved launch of "${c.name}"` });
  });
}

export async function setManaged(db: Database, actor: Actor, id: string, managed: boolean, managerId: string | null) {
  requirePlatform(actor, "platform.campaign_ops");
  const full = await loadCampaign(db, id);
  if (!full) throw new ValidationError("Campaign not found");
  if (managed && !full.organisation.managedServiceActive) throw new ValidationError("Managed service is not active for this organisation");
  if (managerId) {
    const m = await db.query.users.findFirst({ where: eq(users.id, managerId) });
    if (!m?.platformRole) throw new ValidationError("Campaign managers must be AutoSutra staff");
  }
  await db.transaction(async (tx) => {
    await tx.update(campaigns).set({ managed, assignedManagerId: managerId }).where(eq(campaigns.id, id));
    await audit(tx, actor, { action: "campaign.managed_changed", entityType: "campaign", entityId: id, organisationId: full.campaign.organisationId, summary: `Managed service ${managed ? "on" : "off"}${managerId ? ", manager assigned" : ""}` });
  });
}

export async function addNote(db: Database, actor: Actor, id: string, kind: "internal_note" | "optimisation", body: string) {
  requirePlatform(actor, "platform.campaign_ops");
  const text = parse(z.object({ body: requiredText("Note", 4000) }), { body }).body;
  const full = await loadCampaign(db, id);
  if (!full) throw new ValidationError("Campaign not found");
  await db.transaction(async (tx) => {
    await tx.insert(campaignNotes).values({ campaignId: id, authorId: actor.user.id, kind, body: text });
    await audit(tx, actor, { action: `campaign.${kind}`, entityType: "campaign", entityId: id, organisationId: full.campaign.organisationId, summary: `${kind === "optimisation" ? "Optimisation action" : "Internal note"} on "${full.campaign.name}"`, data: { body: text } });
  });
}

// ------------------------------------------------------------------ cancel / archive / close

export async function cancel(db: Database, actor: Actor, id: string, input: unknown) {
  const { reason } = parse(reasonSchema, input);
  const full = await getCampaign(db, actor, id, "campaign.edit");
  const c = full.campaign;
  if (!["draft", "changes_requested", "pending_approval", "pending_funding", "ready_to_publish"].includes(c.status)) {
    throw new ValidationError("Published campaigns must be paused and completed instead of cancelled");
  }
  await db.transaction(async (tx) => {
    await releaseCampaignBudget(tx, actor, c, `cancelled: ${reason}`);
    await setStatus(tx, c.id, ["draft", "changes_requested", "pending_approval", "pending_funding", "ready_to_publish"], "cancelled", { currentApprovalId: null });
    await audit(tx, actor, { action: "campaign.cancelled", entityType: "campaign", entityId: c.id, organisationId: c.organisationId, summary: `Cancelled "${c.name}": ${reason}` });
  });
}

export async function archive(db: Database, actor: Actor, id: string) {
  const full = await getCampaign(db, actor, id, "campaign.edit");
  const c = full.campaign;
  if (!["completed", "cancelled", "failed", "rejected", "demo_published"].includes(c.status)) throw new ValidationError("Only finished campaigns can be archived");
  await db.transaction(async (tx) => {
    await setStatus(tx, c.id, ["completed", "cancelled", "failed", "rejected", "demo_published"], "archived");
    await audit(tx, actor, { action: "campaign.archived", entityType: "campaign", entityId: c.id, organisationId: c.organisationId, summary: `Archived "${c.name}"` });
  });
}

// ------------------------------------------------------------------ publish gate

/**
 * Confirms the campaign may be published right now and returns the approval it
 * is published under. The current configuration must match the approved hash.
 */
export async function assertPublishable(db: DbOrTx, full: FullCampaign) {
  const c = full.campaign;
  if (c.status !== "ready_to_publish") throw new ValidationError(c.status === "pending_funding" ? "Add funds before publishing" : "Only approved campaigns can be published");
  const approval = full.approvals.find((a) => a.id === c.currentApprovalId && a.stage === "customer" && a.decision === "approved");
  if (!approval) throw new ValidationError("No valid approval for this campaign");
  if (approval.campaignVersion !== c.version || approval.configHash !== hashSnapshot(configSnapshot(full))) {
    throw new ConflictError("The campaign changed after approval. It must be approved again.");
  }
  if (c.managed) {
    const internal = full.approvals.find((a) => a.stage === "internal" && a.decision === "approved" && a.configHash === approval.configHash);
    if (!internal) throw new ValidationError("Managed campaigns need AutoSutra operations sign-off before launch");
  }
  const readiness = await checkReadiness(db, full);
  // The start date may have passed between approval and publishing; that alone does not block launch.
  const blockers = readiness.blockers.filter((b) => b.key !== "start_past");
  if (blockers.length) throw new ValidationError(`Cannot publish: ${blockers.map((b) => b.message).join(" ")}`);
  return approval;
}

/** Overall campaign status derived from the per-platform statuses reported by providers. */
export function deriveStatus(platformStatuses: (typeof campaignPlatforms.$inferSelect)["status"][]): Status {
  const s = platformStatuses;
  if (!s.length) return "ready_to_publish";
  if (s.every((x) => x === "demo")) return "demo_published";
  if (s.some((x) => x === "queued" || x === "publishing")) return "publishing";
  if (s.every((x) => x === "active")) return "active";
  if (s.every((x) => x === "paused")) return "paused";
  if (s.every((x) => x === "completed")) return "completed";
  if (s.every((x) => x === "rejected")) return "rejected";
  if (s.every((x) => x === "failed" || x === "rejected")) return "failed";
  if (s.every((x) => x === "pending_review" || x === "paused" || x === "active" || x === "completed")) {
    if (s.some((x) => x === "pending_review")) return "publishing";
    if (s.some((x) => x === "active")) return "active";
    return s.some((x) => x === "paused") ? "paused" : "completed";
  }
  return "partially_published";
}
