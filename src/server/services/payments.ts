/**
 * Payments and verified webhooks.
 *
 * Money is only credited from a gateway webhook whose signature verifies over
 * the raw body. Browser redirects after checkout never change balances.
 * Each webhook event id is stored once (unique index), so duplicate
 * deliveries are acknowledged without being processed twice, and every ledger
 * posting has its own idempotency key as a second line of defence.
 */
import { and, desc, eq } from "drizzle-orm";
import type { Database, DbOrTx } from "../db/client";
import { advertisingDeposits, invoices, paymentWebhookEvents, payments, refunds, subscriptions } from "../db/schema";
import { audit } from "../audit";
import { requireOrg, requirePlatform, type Actor } from "../auth/context";
import { formatINR } from "@/lib/money";
import { ConflictError, NotFoundError } from "../errors";
import { gateway } from "../payments";
import type { ParsedWebhook } from "../payments/types";
import * as ledger from "./ledger";
import { notify } from "./notifications";

const WEBHOOK_ACTOR = { system: "payment-webhook" } as const;

export type Payment = typeof payments.$inferSelect;

export async function createPayment(
  db: DbOrTx,
  actor: Actor,
  opts: { organisationId: string; purpose: "invoice" | "ad_deposit"; amount: number; invoiceId?: string | null; idempotencyKey: string },
) {
  const existing = await db.query.payments.findFirst({ where: eq(payments.idempotencyKey, opts.idempotencyKey) });
  if (existing) return existing;
  const g = gateway();
  const order = await g.createOrder({
    amount: opts.amount,
    currency: "INR",
    receipt: opts.idempotencyKey,
    notes: { organisation_id: opts.organisationId, purpose: opts.purpose },
  });
  const [p] = await db
    .insert(payments)
    .values({
      organisationId: opts.organisationId,
      purpose: opts.purpose,
      invoiceId: opts.invoiceId ?? null,
      gateway: g.name,
      gatewayOrderId: order.orderId,
      amount: opts.amount,
      status: "pending",
      idempotencyKey: opts.idempotencyKey,
      createdById: actor.user.id,
    })
    .returning();
  await audit(db, actor, { action: "payment.created", entityType: "payment", entityId: p.id, organisationId: opts.organisationId, summary: `Payment order ${order.orderId} for ${formatINR(opts.amount)} (${opts.purpose})` });
  return p;
}

export async function getPaymentForActor(db: DbOrTx, actor: Actor, paymentId: string) {
  const p = await db.query.payments.findFirst({ where: eq(payments.id, paymentId) });
  if (!p) throw new NotFoundError("Not found");
  requireOrg(actor, p.organisationId, p.purpose === "invoice" ? "billing.view" : "wallet.view");
  return p;
}

export interface WebhookOutcome {
  status: number;
  outcome: string;
}

/** Entry point for /api/webhooks/payments/[gateway]. */
export async function handleWebhook(db: Database, gatewayName: string, rawBody: string, headers: Headers): Promise<WebhookOutcome> {
  const g = gateway();
  if (g.name !== gatewayName) return { status: 404, outcome: "unknown_gateway" };
  const valid = g.verifyWebhook(rawBody, headers);
  let parsed: ParsedWebhook;
  try {
    parsed = g.parseWebhook(rawBody, headers);
  } catch {
    return { status: 400, outcome: "unparseable" };
  }
  if (!valid) {
    console.error(JSON.stringify({ level: "warn", msg: "webhook_signature_invalid", gateway: gatewayName, eventId: parsed.eventId }));
    await audit(db, WEBHOOK_ACTOR, { action: "payment.webhook_rejected", entityType: "webhook", entityId: parsed.eventId, summary: `Rejected ${gatewayName} webhook with an invalid signature` });
    return { status: 401, outcome: "invalid_signature" };
  }
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(paymentWebhookEvents)
      .values({ gateway: gatewayName, eventId: parsed.eventId, eventType: parsed.rawType, signatureValid: true, payload: JSON.parse(rawBody), outcome: "processing" })
      .onConflictDoNothing({ target: [paymentWebhookEvents.gateway, paymentWebhookEvents.eventId] })
      .returning({ id: paymentWebhookEvents.id });
    if (!inserted.length) return { status: 200, outcome: "duplicate_ignored" };
    const outcome = await processEvent(tx, parsed);
    // The event row is append-only; the outcome is recorded in the audit log.
    await audit(tx, WEBHOOK_ACTOR, { action: "payment.webhook_processed", entityType: "webhook", entityId: parsed.eventId, summary: `${parsed.rawType}: ${outcome}` });
    return { status: 200, outcome };
  });
}

async function processEvent(tx: DbOrTx, e: ParsedWebhook): Promise<string> {
  if (e.type === "ignored") return "ignored_event_type";
  if (e.type === "refund.processed" || e.type === "refund.failed") {
    const refund = e.refundId ? await tx.query.refunds.findFirst({ where: eq(refunds.gatewayRefundId, e.refundId) }) : undefined;
    if (!refund) return "unknown_refund";
    const { settleRefund, failRefund } = await import("./wallet");
    if (e.type === "refund.processed") await settleRefund(tx, WEBHOOK_ACTOR, refund.id, e.refundId!);
    else await failRefund(tx, WEBHOOK_ACTOR, refund.id, "Gateway reported the refund failed");
    return e.type;
  }
  const payment = e.orderId ? await tx.query.payments.findFirst({ where: eq(payments.gatewayOrderId, e.orderId) }) : undefined;
  if (!payment) return "unknown_order";
  // Lock the payment row so concurrent deliveries of different events serialise.
  await tx.select().from(payments).where(eq(payments.id, payment.id)).for("update");

  if (e.type === "payment.failed") {
    if (payment.status === "captured") return "ignored_failed_after_capture";
    await tx.update(payments).set({ status: "failed", failureReason: e.failureReason ?? "Payment failed", gatewayPaymentId: e.paymentId ?? payment.gatewayPaymentId }).where(eq(payments.id, payment.id));
    if (payment.purpose === "ad_deposit") {
      await tx.update(advertisingDeposits).set({ status: "failed" }).where(eq(advertisingDeposits.paymentId, payment.id));
    }
    await notify(tx, {
      organisationId: payment.organisationId,
      kind: "payment_failed",
      severity: "warning",
      title: "Payment failed",
      body: `${formatINR(payment.amount)} payment did not go through${e.failureReason ? `: ${e.failureReason}` : ""}. No money was taken by AutoSutra.`,
      link: payment.purpose === "invoice" ? "/app/billing" : "/app/wallet",
      dedupeKey: `payment_failed:${payment.id}`,
    });
    await notify(tx, { organisationId: null, audience: "platform", kind: "payment_failed", severity: "warning", title: "Customer payment failed", body: `${formatINR(payment.amount)} (${payment.purpose}): ${e.failureReason ?? "no reason"}`, link: "/admin/finance/payments", dedupeKey: `ops_payment_failed:${payment.id}` });
    return "payment_failed";
  }

  // payment.captured
  if (payment.status === "captured") return "already_captured";
  if (e.amount !== payment.amount) {
    await tx.update(payments).set({ failureReason: `Amount mismatch: gateway reported ${e.amount}, expected ${payment.amount}` }).where(eq(payments.id, payment.id));
    await notify(tx, { organisationId: null, audience: "platform", kind: "payment_mismatch", severity: "critical", title: "Payment amount mismatch", body: `Order ${payment.gatewayOrderId}: gateway ${e.amount} vs expected ${payment.amount}. Not credited.`, link: "/admin/finance/payments", dedupeKey: `mismatch:${payment.id}` });
    return "amount_mismatch_not_credited";
  }
  await tx
    .update(payments)
    .set({ status: "captured", gatewayPaymentId: e.paymentId ?? null, gatewayFee: e.fee ?? null, gatewayTax: e.tax ?? null, failureReason: null })
    .where(eq(payments.id, payment.id));
  if (payment.purpose === "ad_deposit") await confirmDeposit(tx, payment, e);
  else await markInvoicePaid(tx, payment);
  return "captured";
}

async function confirmDeposit(tx: DbOrTx, payment: Payment, e: ParsedWebhook) {
  const deposit = await tx.query.advertisingDeposits.findFirst({ where: eq(advertisingDeposits.paymentId, payment.id) });
  if (!deposit) throw new ConflictError("Captured deposit payment has no deposit record");
  const clearing = await ledger.account(tx, ledger.ACCOUNTS.gatewayClientClearing());
  const available = await ledger.account(tx, ledger.ACCOUNTS.available(payment.organisationId));
  const { entry } = await ledger.post(tx, WEBHOOK_ACTOR, {
    type: "deposit",
    memo: `Advertising budget deposit ${formatINR(payment.amount)} (payment ${e.paymentId ?? payment.gatewayOrderId})`,
    legs: [
      { account: clearing, debit: payment.amount },
      { account: available, credit: payment.amount },
    ],
    idempotencyKey: `deposit:${payment.id}`,
    organisationId: payment.organisationId,
    paymentReference: e.paymentId ?? payment.gatewayOrderId,
  });
  const fees = (e.fee ?? 0) || 0;
  if (fees > 0) {
    // Gateway charges are AutoSutra's cost; the customer is credited the full deposit.
    await ledger.post(tx, WEBHOOK_ACTOR, {
      type: "gateway_fee",
      memo: `Payment gateway charges on deposit ${e.paymentId ?? ""} (incl. GST ${formatINR(e.tax ?? 0)})`,
      legs: [
        { account: await ledger.account(tx, ledger.ACCOUNTS.gatewayFees()), debit: fees },
        { account: clearing, credit: fees },
      ],
      idempotencyKey: `gateway_fee:${payment.id}`,
      organisationId: payment.organisationId,
      paymentReference: e.paymentId ?? null,
    });
  }
  await tx.update(advertisingDeposits).set({ status: "confirmed", ledgerEntryId: entry.id, confirmedAt: new Date() }).where(eq(advertisingDeposits.id, deposit.id));
  await notify(tx, {
    organisationId: payment.organisationId,
    kind: "deposit_confirmed",
    title: "Deposit received",
    body: `${formatINR(payment.amount)} was added to your advertising balance (transaction ${entry.transactionId}).`,
    link: "/app/wallet",
    dedupeKey: `deposit_confirmed:${deposit.id}`,
  });
}

async function markInvoicePaid(tx: DbOrTx, payment: Payment) {
  if (!payment.invoiceId) return;
  const invoice = await tx.query.invoices.findFirst({ where: eq(invoices.id, payment.invoiceId) });
  if (!invoice || invoice.status === "paid") return;
  await ledger.post(tx, WEBHOOK_ACTOR, {
    type: "invoice_payment",
    memo: `Payment received for invoice ${invoice.number}`,
    legs: [
      { account: await ledger.account(tx, ledger.ACCOUNTS.gatewayOperatingClearing()), debit: payment.amount },
      { account: await ledger.account(tx, ledger.ACCOUNTS.receivable(payment.organisationId)), credit: payment.amount },
    ],
    idempotencyKey: `invoice_payment:${payment.id}`,
    organisationId: payment.organisationId,
    paymentReference: payment.gatewayPaymentId ?? payment.gatewayOrderId,
  });
  await tx.update(invoices).set({ status: "paid", paidAt: new Date() }).where(eq(invoices.id, invoice.id));
  if (invoice.subscriptionId) {
    await tx.update(subscriptions).set({ status: "active" }).where(and(eq(subscriptions.id, invoice.subscriptionId), eq(subscriptions.status, "past_due")));
  }
  await notify(tx, { organisationId: payment.organisationId, kind: "invoice_paid", title: `Invoice ${invoice.number} paid`, body: `Thank you. ${formatINR(payment.amount)} received.`, link: `/app/billing/invoices/${invoice.id}`, dedupeKey: `invoice_paid:${invoice.id}` });
}

export async function listPayments(db: DbOrTx, actor: Actor, status?: string) {
  requirePlatform(actor, "platform.view_all");
  return db
    .select()
    .from(payments)
    .where(status ? eq(payments.status, status as Payment["status"]) : undefined)
    .orderBy(desc(payments.createdAt))
    .limit(300);
}

export async function listWebhookEvents(db: DbOrTx, actor: Actor) {
  requirePlatform(actor, "platform.view_all");
  return db.select().from(paymentWebhookEvents).orderBy(desc(paymentWebhookEvents.receivedAt)).limit(100);
}
