/**
 * Reconciliation: compares the ledger with provider-reported spend and the
 * payment gateway records, and lists every difference for a person to
 * resolve. Nothing is corrected automatically. Adjustments follow a
 * two-person rule: one finance user proposes, a different one approves, and
 * only then is a compensating ledger entry posted.
 */
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "../db/client";
import {
  advertisingDeposits,
  budgetReservations,
  campaignApprovals,
  campaignPlatforms,
  campaigns,
  ledgerAccounts,
  ledgerEntries,
  organisations,
  payments,
  reconciliationDifferences,
  reconciliationRuns,
} from "../db/schema";
import { audit } from "../audit";
import { requirePlatform, type Actor, type AnyActor } from "../auth/context";
import { formatINR, parseRupees } from "@/lib/money";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { parse, requiredText } from "../validation";
import * as ledger from "./ledger";
import { notify } from "./notifications";

type DiffInput = { kind: string; amount: number; detail: string; organisationId?: string | null; campaignPlatformId?: string | null; reference?: string | null };

export async function runReconciliation(db: Database, actor: AnyActor) {
  const [run] = await db.insert(reconciliationRuns).values({ triggeredById: "user" in actor ? actor.user.id : null }).returning();
  const diffs: DiffInput[] = [];
  try {
    // 1. Ledger integrity.
    const tb = await ledger.trialBalance(db);
    if (!tb.balanced) diffs.push({ kind: "trial_balance", amount: Math.abs(tb.debits - tb.credits), detail: `Ledger debits ${formatINR(tb.debits)} do not equal credits ${formatINR(tb.credits)}` });

    // 2. Provider-reported spend vs reservations and recognised spend (central wallet).
    const reserved = await db
      .select({ r: budgetReservations, platform: campaignPlatforms, campaignStatus: campaigns.status })
      .from(budgetReservations)
      .innerJoin(campaignPlatforms, eq(campaignPlatforms.id, budgetReservations.campaignPlatformId))
      .innerJoin(campaigns, eq(campaigns.id, budgetReservations.campaignId));
    const byPlatform = new Map<string, { amount: number; platform: typeof campaignPlatforms.$inferSelect; status: string }>();
    for (const row of reserved) {
      const cur = byPlatform.get(row.platform.id) ?? { amount: 0, platform: row.platform, status: row.campaignStatus };
      cur.amount += row.r.amount;
      byPlatform.set(row.platform.id, cur);
    }
    for (const [platformId, { amount, platform, status }] of byPlatform) {
      const recognised = await ledger.recognisedSpend(db, platformId);
      const remaining = await ledger.balanceByCode(db, ledger.ACCOUNTS.reserved(platform.organisationId, platformId, platform.provider).code);
      const reported = platform.reportedSpend;
      if (reported > amount) {
        diffs.push({ kind: "overspend", amount: reported - amount, organisationId: platform.organisationId, campaignPlatformId: platformId, detail: `${platform.provider} reports ${formatINR(reported)} against ${formatINR(amount)} reserved` });
      } else if (reported > recognised) {
        diffs.push({ kind: "unrecognised_spend", amount: reported - recognised, organisationId: platform.organisationId, campaignPlatformId: platformId, detail: `${formatINR(reported - recognised)} reported by ${platform.provider} is not yet recognised in the ledger` });
      }
      if (recognised > reported) {
        diffs.push({ kind: "ledger_exceeds_reported", amount: recognised - reported, organisationId: platform.organisationId, campaignPlatformId: platformId, detail: `Ledger recognises ${formatINR(recognised)} but ${platform.provider} now reports ${formatINR(reported)} (provider correction?)` });
      }
      if (["completed", "cancelled", "archived"].includes(status) && remaining > 0) {
        diffs.push({ kind: "unreleased_reservation", amount: remaining, organisationId: platform.organisationId, campaignPlatformId: platformId, detail: `Closed campaign still holds ${formatINR(remaining)} reserved` });
      }
    }

    // 3. Dealer-funded campaigns: reported spend above the customer's authorised maximum.
    const live = await db
      .select({ platform: campaignPlatforms, approval: campaignApprovals })
      .from(campaignPlatforms)
      .innerJoin(campaigns, eq(campaigns.id, campaignPlatforms.campaignId))
      .innerJoin(campaignApprovals, eq(campaignApprovals.id, campaigns.currentApprovalId))
      .where(eq(campaignPlatforms.mode, "live"));
    const spendByCampaign = new Map<string, { reported: number; cap: number | null; orgId: string }>();
    for (const { platform, approval } of live) {
      const cur = spendByCampaign.get(platform.campaignId) ?? { reported: 0, cap: approval.maxAuthorisedSpend, orgId: platform.organisationId };
      cur.reported += platform.reportedSpend;
      spendByCampaign.set(platform.campaignId, cur);
    }
    for (const [campaignId, v] of spendByCampaign) {
      if (v.cap && v.reported > v.cap) diffs.push({ kind: "authorised_spend_exceeded", amount: v.reported - v.cap, organisationId: v.orgId, reference: campaignId, detail: `Reported spend ${formatINR(v.reported)} exceeds the authorised ${formatINR(v.cap)}` });
    }

    // 4. Payments vs ledger.
    const captured = await db.select().from(payments).where(eq(payments.status, "captured"));
    for (const p of captured) {
      const key = p.purpose === "ad_deposit" ? `deposit:${p.id}` : `invoice_payment:${p.id}`;
      const entry = await db.query.ledgerEntries.findFirst({ where: eq(ledgerEntries.idempotencyKey, key) });
      if (!entry) diffs.push({ kind: "unposted_payment", amount: p.amount, organisationId: p.organisationId, reference: p.gatewayOrderId, detail: `Captured payment ${p.gatewayOrderId} has no ledger entry` });
    }
    const confirmedDeposits = await db.select().from(advertisingDeposits).where(eq(advertisingDeposits.status, "confirmed"));
    for (const d of confirmedDeposits) {
      const p = d.paymentId ? captured.find((x) => x.id === d.paymentId) : undefined;
      if (!p) diffs.push({ kind: "deposit_without_capture", amount: d.amount, organisationId: d.organisationId, reference: d.id, detail: "Deposit marked confirmed without a captured payment" });
    }
    const stale = await db.select().from(payments).where(and(eq(payments.status, "pending"), lt(payments.createdAt, new Date(Date.now() - 24 * 3600_000))));
    for (const p of stale) diffs.push({ kind: "stale_pending_payment", amount: p.amount, organisationId: p.organisationId, reference: p.gatewayOrderId, detail: `Payment ${p.gatewayOrderId} pending for over 24 hours; check the gateway` });

    // 5. Organisation balances must never be negative.
    const liabilities = await db.select().from(ledgerAccounts).where(and(eq(ledgerAccounts.type, "liability"), sql`${ledgerAccounts.organisationId} IS NOT NULL`));
    for (const a of liabilities) {
      const b = await ledger.balanceOf(db, a);
      if (b < 0) diffs.push({ kind: "negative_balance", amount: -b, organisationId: a.organisationId, reference: a.code, detail: `${a.name} is negative (${formatINR(b)})` });
    }

    // Record new differences; an identical open difference is not duplicated.
    let created = 0;
    for (const d of diffs) {
      const existing = await db.query.reconciliationDifferences.findFirst({
        where: and(
          eq(reconciliationDifferences.kind, d.kind),
          inArray(reconciliationDifferences.status, ["open"]),
          d.campaignPlatformId ? eq(reconciliationDifferences.campaignPlatformId, d.campaignPlatformId) : isNull(reconciliationDifferences.campaignPlatformId),
          d.reference ? eq(reconciliationDifferences.reference, d.reference) : isNull(reconciliationDifferences.reference),
        ),
      });
      if (existing) {
        if (existing.amount !== d.amount) await db.update(reconciliationDifferences).set({ amount: d.amount, detail: d.detail }).where(eq(reconciliationDifferences.id, existing.id));
        continue;
      }
      await db.insert(reconciliationDifferences).values({ runId: run.id, kind: d.kind, amount: d.amount, detail: d.detail, organisationId: d.organisationId ?? null, campaignPlatformId: d.campaignPlatformId ?? null, reference: d.reference ?? null });
      created++;
    }
    const summary = { differences: diffs.length, newDifferences: created, trialBalance: tb };
    await db.update(reconciliationRuns).set({ status: "completed", finishedAt: new Date(), summary }).where(eq(reconciliationRuns.id, run.id));
    await audit(db, actor, { action: "reconciliation.completed", entityType: "reconciliation_run", entityId: run.id, summary: `Reconciliation found ${diffs.length} difference(s), ${created} new` });
    if (created) {
      await notify(db, { organisationId: null, audience: "platform", kind: "reconciliation_differences", severity: "warning", title: "Reconciliation differences found", body: `${created} new difference(s) need review.`, link: "/admin/finance/reconciliation", dedupeKey: `recon:${run.id}` });
    }
    return { run, summary };
  } catch (e) {
    await db.update(reconciliationRuns).set({ status: "failed", finishedAt: new Date(), summary: { error: e instanceof Error ? e.message : String(e) } }).where(eq(reconciliationRuns.id, run.id));
    throw e;
  }
}

// ------------------------------------------------------------------ resolution

export const ADJUSTMENTS = {
  charge_customer_overspend: "Charge the overspend to the customer's available balance",
  absorb_overspend: "AutoSutra absorbs the overspend (suspense, then write-off)",
  release_reservation: "Release the leftover reservation to the customer's available balance",
} as const;
type AdjustmentKind = keyof typeof ADJUSTMENTS;

const proposeSchema = z.object({
  kind: z.enum(Object.keys(ADJUSTMENTS) as [AdjustmentKind, ...AdjustmentKind[]]),
  amount: z.string(),
  note: requiredText("Note", 1000),
});

export async function proposeAdjustment(db: Database, actor: Actor, differenceId: string, input: unknown) {
  requirePlatform(actor, "platform.finance");
  const data = parse(proposeSchema, input);
  const amount = parseRupees(data.amount);
  const diff = await db.query.reconciliationDifferences.findFirst({ where: eq(reconciliationDifferences.id, differenceId) });
  if (!diff) throw new NotFoundError("Difference not found");
  if (diff.status !== "open") throw new ConflictError("This difference is already resolved");
  if (amount <= 0 || amount > diff.amount) throw new ValidationError(`Adjustment must be between ₹0.01 and ${formatINR(diff.amount)}`);
  if (!diff.campaignPlatformId) throw new ValidationError("Adjustments are only available for campaign spend differences; resolve others with a note.");
  await db.update(reconciliationDifferences).set({ proposedAdjustment: { kind: data.kind, amount, note: data.note }, proposedById: actor.user.id, proposedAt: new Date() }).where(eq(reconciliationDifferences.id, diff.id));
  await audit(db, actor, { action: "reconciliation.adjustment_proposed", entityType: "reconciliation_difference", entityId: diff.id, organisationId: diff.organisationId, summary: `Proposed ${data.kind} of ${formatINR(amount)}: ${data.note}` });
}

export async function approveAdjustment(db: Database, actor: Actor, differenceId: string) {
  requirePlatform(actor, "platform.finance");
  const diff = await db.query.reconciliationDifferences.findFirst({ where: eq(reconciliationDifferences.id, differenceId) });
  if (!diff?.proposedAdjustment || !diff.proposedById) throw new ValidationError("There is no proposed adjustment to approve");
  if (diff.proposedById === actor.user.id) throw new ForbiddenError("A different finance user must approve this adjustment");
  if (diff.status !== "open") throw new ConflictError("Already resolved");
  const platform = await db.query.campaignPlatforms.findFirst({ where: eq(campaignPlatforms.id, diff.campaignPlatformId!) });
  if (!platform) throw new NotFoundError("Campaign platform not found");
  const { kind, amount, note } = diff.proposedAdjustment as { kind: AdjustmentKind; amount: number; note: string };
  await db.transaction(async (tx) => {
    const orgId = platform.organisationId;
    let legs: ledger.Leg[];
    if (kind === "charge_customer_overspend") {
      const available = await ledger.account(tx, ledger.ACCOUNTS.available(orgId));
      await ledger.lockAccount(tx, available);
      if ((await ledger.balanceOf(tx, available)) < amount) throw new ValidationError("The customer's available balance is too low; collect a deposit first or absorb the difference");
      legs = [{ account: available, debit: amount }, { account: await ledger.account(tx, ledger.ACCOUNTS.mediaPayable(platform.provider)), credit: amount }];
    } else if (kind === "absorb_overspend") {
      legs = [{ account: await ledger.account(tx, ledger.ACCOUNTS.suspense()), debit: amount }, { account: await ledger.account(tx, ledger.ACCOUNTS.mediaPayable(platform.provider)), credit: amount }];
    } else {
      const reserved = await ledger.account(tx, ledger.ACCOUNTS.reserved(orgId, platform.id, platform.provider));
      await ledger.lockAccount(tx, reserved);
      if ((await ledger.balanceOf(tx, reserved)) < amount) throw new ValidationError("The reservation no longer holds that amount");
      legs = [{ account: reserved, debit: amount }, { account: await ledger.account(tx, ledger.ACCOUNTS.available(orgId)), credit: amount }];
    }
    const { entry } = await ledger.post(tx, actor, {
      type: "reconciliation_adjustment",
      memo: `${ADJUSTMENTS[kind]}: ${note}`,
      legs,
      idempotencyKey: `recon_adjustment:${diff.id}`,
      organisationId: orgId,
      campaignId: platform.campaignId,
      reconciliationReference: diff.id,
    });
    await tx
      .update(reconciliationDifferences)
      .set({ status: "adjusted", resolvedById: actor.user.id, resolvedAt: new Date(), adjustmentEntryId: entry.id, resolutionNote: `Approved adjustment: ${note}` })
      .where(eq(reconciliationDifferences.id, diff.id));
    await audit(tx, actor, { action: "reconciliation.adjustment_approved", entityType: "reconciliation_difference", entityId: diff.id, organisationId: orgId, summary: `Approved ${kind} of ${formatINR(amount)} (${entry.transactionId})` });
  });
}

export async function resolveDifference(db: Database, actor: Actor, differenceId: string, note: string) {
  requirePlatform(actor, "platform.finance");
  if (!note.trim()) throw new ValidationError("Explain how this difference was resolved");
  const diff = await db.query.reconciliationDifferences.findFirst({ where: eq(reconciliationDifferences.id, differenceId) });
  if (!diff) throw new NotFoundError("Not found");
  if (diff.status !== "open") throw new ConflictError("Already resolved");
  await db.update(reconciliationDifferences).set({ status: "resolved", resolutionNote: note.trim(), resolvedById: actor.user.id, resolvedAt: new Date() }).where(eq(reconciliationDifferences.id, diff.id));
  await audit(db, actor, { action: "reconciliation.resolved", entityType: "reconciliation_difference", entityId: diff.id, organisationId: diff.organisationId, summary: `Resolved ${diff.kind}: ${note.trim()}` });
}

export async function listDifferences(db: DbOrTx, actor: Actor, status: "open" | "all" = "open") {
  requirePlatform(actor, "platform.view_all");
  return db
    .select({ d: reconciliationDifferences, organisationName: organisations.name })
    .from(reconciliationDifferences)
    .leftJoin(organisations, eq(organisations.id, reconciliationDifferences.organisationId))
    .where(status === "open" ? eq(reconciliationDifferences.status, "open") : undefined)
    .orderBy(desc(reconciliationDifferences.amount))
    .limit(500);
}

export async function listRuns(db: DbOrTx, actor: Actor) {
  requirePlatform(actor, "platform.view_all");
  return db.select().from(reconciliationRuns).orderBy(desc(reconciliationRuns.startedAt)).limit(30);
}

/** Customer-facing reconciliation status for their organisation. */
export async function orgReconciliationStatus(db: DbOrTx, organisationId: string) {
  const open = await db.select().from(reconciliationDifferences).where(and(eq(reconciliationDifferences.organisationId, organisationId), eq(reconciliationDifferences.status, "open")));
  const [last] = await db.select().from(reconciliationRuns).where(eq(reconciliationRuns.status, "completed")).orderBy(desc(reconciliationRuns.finishedAt)).limit(1);
  return { openDifferences: open.length, lastRunAt: last?.finishedAt ?? null };
}
