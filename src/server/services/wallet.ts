/**
 * Advertising-budget wallet (central funding model only).
 *
 * This is a ledger of customer advertising funds held under an approved
 * funding arrangement. It is NOT a stored-value payment instrument: balances
 * cannot be transferred between customers, withdrawn as cash on demand, or
 * spent on anything except approved campaigns, and refunds go back through
 * the original payment route or a recorded bank transfer.
 *
 * Every function here refuses to run unless the `central_wallet` flag is on,
 * and live collection additionally needs `live_deposit_collection` plus
 * PAYMENTS_LIVE=true.
 */
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "../db/client";
import { advertisingDeposits, organisations, payments, refunds } from "../db/schema";
import { audit } from "../audit";
import { requireOrg, requirePlatform, type Actor, type AnyActor } from "../auth/context";
import { formatINR, parseRupees, MoneyError } from "@/lib/money";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { getEnv } from "../env";
import { isEnabled } from "../flags";
import { gateway } from "../payments";
import { optionalText, parse, requiredText } from "../validation";
import * as ledger from "./ledger";
import { notify } from "./notifications";
import { createPayment } from "./payments";

export const DEPOSIT_LIMITS = { min: 1_000_00, max: 10_00_000_00, monthly: 50_00_000_00 };

async function requireWallet(db: DbOrTx) {
  if (!(await isEnabled(db, "central_wallet"))) {
    throw new ForbiddenError("Centralised advertising budgets are not enabled. Your ad platforms bill your own ad accounts directly.");
  }
}

function amountFrom(raw: unknown, label = "Amount"): number {
  try {
    return parseRupees(String(raw ?? ""));
  } catch (e) {
    if (e instanceof MoneyError) throw new ValidationError(`${label}: ${e.message}`, { amount: e.message });
    throw e;
  }
}

// ------------------------------------------------------------------ deposits

export async function startDeposit(db: Database, actor: Actor, organisationId: string, input: { amount: unknown; requestKey: string }) {
  requireOrg(actor, organisationId, "wallet.deposit");
  await requireWallet(db);
  const env = getEnv();
  if (gateway().live && !(env.PAYMENTS_LIVE && (await isEnabled(db, "live_deposit_collection")))) {
    throw new ForbiddenError("Live deposit collection is not enabled.");
  }
  const amount = amountFrom(input.amount);
  if (amount < DEPOSIT_LIMITS.min) throw new ValidationError(`The minimum deposit is ${formatINR(DEPOSIT_LIMITS.min, { decimals: false })}`, { amount: "Below minimum" });
  if (amount > DEPOSIT_LIMITS.max) throw new ValidationError(`The maximum single deposit is ${formatINR(DEPOSIT_LIMITS.max, { decimals: false })}`, { amount: "Above maximum" });
  const org = await db.query.organisations.findFirst({ where: eq(organisations.id, organisationId) });
  if (org?.verificationStatus !== "verified") throw new ForbiddenError("Your organisation must be verified by AutoSutra before depositing advertising budgets.");
  const monthStart = new Date(new Date().toISOString().slice(0, 7) + "-01T00:00:00Z");
  const [{ total }] = await db
    .select({ total: sql<string>`coalesce(sum(${advertisingDeposits.amount}), 0)` })
    .from(advertisingDeposits)
    .where(and(eq(advertisingDeposits.organisationId, organisationId), eq(advertisingDeposits.status, "confirmed"), gte(advertisingDeposits.createdAt, monthStart)));
  if (Number(total) + amount > DEPOSIT_LIMITS.monthly) throw new ValidationError("This deposit would exceed the monthly deposit limit for your organisation. Contact AutoSutra finance.");
  if (!/^[\w-]{8,64}$/.test(input.requestKey)) throw new ValidationError("Invalid request");

  return db.transaction(async (tx) => {
    const payment = await createPayment(tx, actor, { organisationId, purpose: "ad_deposit", amount, idempotencyKey: `deposit:${organisationId}:${input.requestKey}` });
    const existing = await tx.query.advertisingDeposits.findFirst({ where: eq(advertisingDeposits.paymentId, payment.id) });
    if (existing) return { deposit: existing, payment };
    const [deposit] = await tx
      .insert(advertisingDeposits)
      .values({ organisationId, amount, paymentId: payment.id, createdById: actor.user.id })
      .returning();
    await audit(tx, actor, { action: "wallet.deposit_started", entityType: "advertising_deposit", entityId: deposit.id, organisationId, summary: `Started deposit of ${formatINR(amount)}` });
    return { deposit, payment };
  });
}

/** Pending deposits that never completed are cancelled after 24 hours. */
export async function expireStaleDeposits(db: DbOrTx) {
  const cutoff = new Date(Date.now() - 24 * 3600_000);
  const stale = await db.select().from(advertisingDeposits).where(and(eq(advertisingDeposits.status, "pending"), lt(advertisingDeposits.createdAt, cutoff)));
  for (const d of stale) {
    await db.update(advertisingDeposits).set({ status: "cancelled" }).where(eq(advertisingDeposits.id, d.id));
    if (d.paymentId) await db.update(payments).set({ status: "failed", failureReason: "Checkout not completed within 24 hours" }).where(and(eq(payments.id, d.paymentId), eq(payments.status, "pending")));
  }
  return stale.length;
}

// ------------------------------------------------------------------ overview

export async function walletOverview(db: DbOrTx, actor: Actor, organisationId: string, range: { from?: string; to?: string } = {}) {
  requireOrg(actor, organisationId, "wallet.view");
  const balances = await ledger.orgBalances(db, organisationId);
  const [pending] = await db
    .select({ total: sql<string>`coalesce(sum(${advertisingDeposits.amount}), 0)`, n: sql<number>`count(*)` })
    .from(advertisingDeposits)
    .where(and(eq(advertisingDeposits.organisationId, organisationId), eq(advertisingDeposits.status, "pending")));
  const from = range.from && /^\d{4}-\d{2}-\d{2}$/.test(range.from) ? new Date(`${range.from}T00:00:00+05:30`) : undefined;
  const to = range.to && /^\d{4}-\d{2}-\d{2}$/.test(range.to) ? new Date(`${range.to}T23:59:59+05:30`) : undefined;
  const entries = await ledger.orgTransactions(db, organisationId, { from, to });
  const refundRows = await db.select().from(refunds).where(eq(refunds.organisationId, organisationId)).orderBy(desc(refunds.createdAt)).limit(50);
  const deposits = await db.select().from(advertisingDeposits).where(eq(advertisingDeposits.organisationId, organisationId)).orderBy(desc(advertisingDeposits.createdAt)).limit(50);
  return { ...balances, pendingDeposits: Number(pending.total), pendingDepositCount: Number(pending.n), entries, refunds: refundRows, deposits };
}

// ------------------------------------------------------------------ refunds

const refundSchema = z.object({ amount: z.unknown(), reason: requiredText("Reason", 1000) });

export async function requestRefund(db: Database, actor: Actor, organisationId: string, input: unknown) {
  requireOrg(actor, organisationId, "wallet.refund_request");
  await requireWallet(db);
  const data = parse(refundSchema, input);
  const amount = amountFrom(data.amount);
  const available = await ledger.balanceByCode(db, ledger.ACCOUNTS.available(organisationId).code);
  if (amount > available) throw new ValidationError(`You can request up to your unallocated balance of ${formatINR(available)}. Reserved campaign budgets must be released first.`);
  return db.transaction(async (tx) => {
    const [r] = await tx.insert(refunds).values({ organisationId, amount, reason: data.reason, requestedById: actor.user.id }).returning();
    await audit(tx, actor, { action: "wallet.refund_requested", entityType: "refund", entityId: r.id, organisationId, summary: `Requested refund of ${formatINR(amount)}: ${data.reason}` });
    await notify(tx, { organisationId: null, audience: "platform", kind: "refund_requested", title: "Refund requested", body: `${formatINR(amount)}: ${data.reason}`, link: "/admin/finance/refunds", dedupeKey: `refund_requested:${r.id}` });
    return r;
  });
}

const decisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: optionalText(1000),
  confirmAmount: z.string().optional(),
});

/**
 * Finance approval. Approving moves the amount from the available balance to
 * "refund pending" (so it cannot be reserved for campaigns), then asks the
 * gateway to refund against a captured deposit payment.
 */
export async function decideRefund(db: Database, actor: Actor, refundId: string, input: unknown) {
  requirePlatform(actor, "platform.finance");
  const data = parse(decisionSchema, input);
  const refund = await db.query.refunds.findFirst({ where: eq(refunds.id, refundId) });
  if (!refund) throw new NotFoundError("Refund not found");
  if (refund.status !== "requested") throw new ConflictError("This refund has already been decided");
  if (refund.requestedById === actor.user.id) throw new ForbiddenError("You cannot decide a refund you requested");
  if (data.decision === "reject") {
    if (!data.note) throw new ValidationError("Give a reason for rejecting the refund");
    await db.transaction(async (tx) => {
      await tx.update(refunds).set({ status: "rejected", decidedById: actor.user.id, decisionNote: data.note }).where(eq(refunds.id, refund.id));
      await audit(tx, actor, { action: "wallet.refund_rejected", entityType: "refund", entityId: refund.id, organisationId: refund.organisationId, summary: `Rejected refund of ${formatINR(refund.amount)}: ${data.note}` });
      await notify(tx, { organisationId: refund.organisationId, kind: "refund_rejected", title: "Refund request declined", body: data.note!, link: "/app/wallet", dedupeKey: `refund_rejected:${refund.id}` });
    });
    return;
  }
  // Additional confirmation for a sensitive financial action.
  if (amountFrom(data.confirmAmount, "Confirmation amount") !== refund.amount) {
    throw new ValidationError("Type the exact refund amount to confirm", { confirmAmount: "Does not match" });
  }
  const pay = await db
    .select()
    .from(payments)
    .where(and(eq(payments.organisationId, refund.organisationId), eq(payments.purpose, "ad_deposit"), eq(payments.status, "captured"), sql`${payments.amount} - ${payments.refundedAmount} >= ${refund.amount}`))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  await db.transaction(async (tx) => {
    const available = await ledger.account(tx, ledger.ACCOUNTS.available(refund.organisationId));
    await ledger.lockAccount(tx, available);
    if ((await ledger.balanceOf(tx, available)) < refund.amount) throw new ValidationError("The organisation no longer has enough unallocated balance for this refund");
    const { entry } = await ledger.post(tx, actor, {
      type: "refund_hold",
      memo: `Refund approved: ${formatINR(refund.amount)} held for return`,
      legs: [
        { account: available, debit: refund.amount },
        { account: await ledger.account(tx, ledger.ACCOUNTS.refundPending(refund.organisationId)), credit: refund.amount },
      ],
      idempotencyKey: `refund_hold:${refund.id}`,
      organisationId: refund.organisationId,
    });
    await tx
      .update(refunds)
      .set({ status: "approved", decidedById: actor.user.id, decisionNote: data.note ?? null, holdEntryId: entry.id, paymentId: pay[0]?.id ?? null })
      .where(eq(refunds.id, refund.id));
    await audit(tx, actor, { action: "wallet.refund_approved", entityType: "refund", entityId: refund.id, organisationId: refund.organisationId, summary: `Approved refund of ${formatINR(refund.amount)}` });
  });
  if (!pay[0]?.gatewayPaymentId) {
    // No single payment can carry the refund: finance completes it by bank transfer and records the reference.
    await db.update(refunds).set({ status: "processing", failureReason: "No single captured deposit covers this amount; complete by bank transfer." }).where(eq(refunds.id, refund.id));
    return;
  }
  let result;
  try {
    result = await gateway().refund(pay[0].gatewayPaymentId, refund.amount, refund.id);
  } catch (e) {
    // Outcome unknown: keep the hold, let finance check the gateway dashboard and complete or fail it.
    await db.update(refunds).set({ status: "processing", failureReason: `Gateway refund request did not complete: ${e instanceof Error ? e.message : String(e)}. Check the gateway before retrying.` }).where(eq(refunds.id, refund.id));
    return;
  }
  await db.transaction(async (tx) => {
    if (result.status === "failed") {
      await failRefund(tx, actor, refund.id, "The gateway declined the refund");
      return;
    }
    await tx.update(refunds).set({ status: "processing", gatewayRefundId: result.refundId }).where(eq(refunds.id, refund.id));
    await tx.update(payments).set({ refundedAmount: sql`${payments.refundedAmount} + ${refund.amount}` }).where(eq(payments.id, pay[0].id));
    if (result.status === "processed") await settleRefund(tx, actor, refund.id, result.refundId);
  });
}

/** The money has left: clear "refund pending" against the gateway clearing account or the bank. */
export async function settleRefund(tx: DbOrTx, actor: AnyActor, refundId: string, reference: string, viaBank = false) {
  const refund = await tx.query.refunds.findFirst({ where: eq(refunds.id, refundId) });
  if (!refund || refund.status === "completed") return;
  if (!["approved", "processing"].includes(refund.status)) throw new ConflictError("Refund is not in progress");
  const { entry } = await ledger.post(tx, actor, {
    type: "refund_settled",
    memo: `Refund of ${formatINR(refund.amount)} paid (${reference})`,
    legs: [
      { account: await ledger.account(tx, ledger.ACCOUNTS.refundPending(refund.organisationId)), debit: refund.amount },
      { account: await ledger.account(tx, viaBank ? ledger.ACCOUNTS.clientFundsBank() : ledger.ACCOUNTS.gatewayClientClearing()), credit: refund.amount },
    ],
    idempotencyKey: `refund_settled:${refund.id}`,
    organisationId: refund.organisationId,
    paymentReference: reference,
  });
  await tx.update(refunds).set({ status: "completed", settleEntryId: entry.id, bankReference: viaBank ? reference : refund.bankReference }).where(eq(refunds.id, refund.id));
  await notify(tx, { organisationId: refund.organisationId, kind: "refund_completed", title: "Refund sent", body: `${formatINR(refund.amount)} has been refunded (${reference}). Banks may take several working days to show it.`, link: "/app/wallet", dedupeKey: `refund_completed:${refund.id}` });
}

export async function failRefund(tx: DbOrTx, actor: AnyActor, refundId: string, reason: string) {
  const refund = await tx.query.refunds.findFirst({ where: eq(refunds.id, refundId) });
  if (!refund || !["approved", "processing"].includes(refund.status)) return;
  await ledger.post(tx, actor, {
    type: "refund_reversed",
    memo: `Refund failed, ${formatINR(refund.amount)} returned to available balance: ${reason}`,
    legs: [
      { account: await ledger.account(tx, ledger.ACCOUNTS.refundPending(refund.organisationId)), debit: refund.amount },
      { account: await ledger.account(tx, ledger.ACCOUNTS.available(refund.organisationId)), credit: refund.amount },
    ],
    idempotencyKey: `refund_reversed:${refund.id}`,
    organisationId: refund.organisationId,
  });
  await tx.update(refunds).set({ status: "failed", failureReason: reason }).where(eq(refunds.id, refund.id));
  if (refund.paymentId) await tx.update(payments).set({ refundedAmount: sql`greatest(${payments.refundedAmount} - ${refund.amount}, 0)` }).where(eq(payments.id, refund.paymentId));
  await notify(tx, { organisationId: null, audience: "platform", kind: "refund_failed", severity: "critical", title: "Refund failed", body: `${formatINR(refund.amount)}: ${reason}`, link: "/admin/finance/refunds", dedupeKey: `refund_failed:${refund.id}` });
}

export async function markRefundFailed(db: Database, actor: Actor, refundId: string, reason: string) {
  requirePlatform(actor, "platform.finance");
  if (!reason.trim()) throw new ValidationError("Give a reason");
  await db.transaction(async (tx) => {
    await failRefund(tx, actor, refundId, reason.trim());
    await audit(tx, actor, { action: "wallet.refund_marked_failed", entityType: "refund", entityId: refundId, summary: `Refund marked failed: ${reason.trim()}` });
  });
}

export async function completeRefundByBank(db: Database, actor: Actor, refundId: string, bankReference: string) {
  requirePlatform(actor, "platform.finance");
  if (!bankReference.trim()) throw new ValidationError("Enter the bank transfer reference (UTR)");
  await db.transaction(async (tx) => {
    await settleRefund(tx, actor, refundId, bankReference.trim(), true);
    await audit(tx, actor, { action: "wallet.refund_bank_completed", entityType: "refund", entityId: refundId, summary: `Refund completed by bank transfer ${bankReference.trim()}` });
  });
}

// ------------------------------------------------------------------ provider payments & settlements (finance)

export async function recordProviderPayment(db: Database, actor: Actor, provider: "meta" | "google", amountRaw: unknown, reference: string) {
  requirePlatform(actor, "platform.finance");
  const amount = amountFrom(amountRaw);
  if (!reference.trim()) throw new ValidationError("Enter the provider invoice or payment reference");
  await db.transaction(async (tx) => {
    const payable = await ledger.account(tx, ledger.ACCOUNTS.mediaPayable(provider));
    await ledger.lockAccount(tx, payable);
    if ((await ledger.balanceOf(tx, payable)) < amount) throw new ValidationError("This is more than the recognised spend payable to this provider");
    const r = await ledger.post(tx, actor, {
      type: "provider_payment",
      memo: `Paid ${provider} ${formatINR(amount)} (${reference.trim()})`,
      legs: [
        { account: payable, debit: amount },
        { account: await ledger.account(tx, ledger.ACCOUNTS.clientFundsBank()), credit: amount },
      ],
      idempotencyKey: `provider_payment:${provider}:${reference.trim()}`,
      paymentReference: reference.trim(),
    });
    ledger.assertNotDuplicate(r, "This provider payment reference has already been recorded");
  });
}

export async function recordSettlement(db: Database, actor: Actor, kind: "client" | "operating", amountRaw: unknown, reference: string) {
  requirePlatform(actor, "platform.finance");
  const amount = amountFrom(amountRaw);
  if (!reference.trim()) throw new ValidationError("Enter the settlement reference");
  await db.transaction(async (tx) => {
    const clearing = await ledger.account(tx, kind === "client" ? ledger.ACCOUNTS.gatewayClientClearing() : ledger.ACCOUNTS.gatewayOperatingClearing());
    await ledger.lockAccount(tx, clearing);
    if ((await ledger.balanceOf(tx, clearing)) < amount) throw new ValidationError("Settlement exceeds the gateway clearing balance");
    const r = await ledger.post(tx, actor, {
      type: "gateway_settlement",
      memo: `Gateway settlement ${formatINR(amount)} to ${kind === "client" ? "client funds" : "operating"} bank (${reference.trim()})`,
      legs: [
        { account: await ledger.account(tx, kind === "client" ? ledger.ACCOUNTS.clientFundsBank() : ledger.ACCOUNTS.operatingBank()), debit: amount },
        { account: clearing, credit: amount },
      ],
      idempotencyKey: `settlement:${kind}:${reference.trim()}`,
      paymentReference: reference.trim(),
    });
    ledger.assertNotDuplicate(r, "This settlement reference has already been recorded");
  });
}

export async function listRefunds(db: DbOrTx, actor: Actor) {
  requirePlatform(actor, "platform.view_all");
  return db.select().from(refunds).orderBy(desc(refunds.createdAt)).limit(300);
}
