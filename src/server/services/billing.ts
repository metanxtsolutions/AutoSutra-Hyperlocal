/**
 * Software subscriptions and AutoSutra service invoices.
 *
 * These are AutoSutra revenue and are kept apart from advertising budgets:
 * invoices post to receivable / revenue / GST accounts and are paid into the
 * operating clearing account, never into client funds.
 *
 * GST: 18% on services. Intra-state supply (customer billing state equals
 * SUPPLIER_STATE) is split CGST 9% + SGST 9%; otherwise IGST 18%. Tax
 * treatment must be confirmed by AutoSutra's tax adviser before launch.
 */
import { and, asc, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "../db/client";
import { invoiceLines, invoices, locations, organisations, subscriptionPlans, subscriptions } from "../db/schema";
import { audit } from "../audit";
import { requireOrg, requirePlatform, type Actor, type AnyActor } from "../auth/context";
import { bps, formatINR, MoneyError, parseRupees } from "@/lib/money";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { getSetting } from "../flags";
import { optionalText, parse, requiredText } from "../validation";
import * as ledger from "./ledger";
import { notify } from "./notifications";
import { createPayment } from "./payments";

const SYSTEM = { system: "billing" } as const;
type Plan = typeof subscriptionPlans.$inferSelect;
type Subscription = typeof subscriptions.$inferSelect;
type InvoiceKind = (typeof invoices.$inferSelect)["kind"];

function addInterval(d: Date, interval: string): Date {
  const n = new Date(d);
  if (interval === "year") n.setUTCFullYear(n.getUTCFullYear() + 1);
  else n.setUTCMonth(n.getUTCMonth() + 1);
  return n;
}

// ------------------------------------------------------------------ plans

export async function listPlans(db: DbOrTx, opts: { includeInactive?: boolean } = {}) {
  return db
    .select()
    .from(subscriptionPlans)
    .where(opts.includeInactive ? undefined : eq(subscriptionPlans.isActive, true))
    .orderBy(asc(subscriptionPlans.sortOrder));
}

const planSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9_]{2,40}$/, "Code: lowercase letters, digits and underscores"),
  name: requiredText("Name", 80),
  description: optionalText(500),
  price: z.string(),
  interval: z.enum(["month", "year"]),
  maxLocations: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().int().positive().nullable()),
  maxUsers: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().int().positive().nullable()),
  maxActiveCampaigns: z.preprocess((v) => (v === "" ? null : v), z.coerce.number().int().positive().nullable()),
  features: z.preprocess((v) => (typeof v === "string" ? v.split("\n").map((s) => s.trim()).filter(Boolean) : v), z.array(z.string().max(120)).max(20)),
  supportLevel: requiredText("Support level", 40),
  trialDays: z.coerce.number().int().min(0).max(90),
  gstRateBps: z.coerce.number().int().min(0).max(2800),
  isPublic: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(100),
});

export async function savePlan(db: Database, actor: Actor, planId: string | null, input: unknown) {
  requirePlatform(actor, "platform.admin");
  const data = parse(planSchema, input);
  let price: number;
  try {
    price = parseRupees(data.price);
  } catch (e) {
    throw new ValidationError(e instanceof MoneyError ? e.message : "Invalid price", { price: "Invalid" });
  }
  const values = { ...data, description: data.description ?? "", price };
  await db.transaction(async (tx) => {
    if (planId) {
      const before = await tx.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.id, planId) });
      if (!before) throw new NotFoundError("Plan not found");
      await tx.update(subscriptionPlans).set(values).where(eq(subscriptionPlans.id, planId));
      await audit(tx, actor, { action: "plan.updated", entityType: "subscription_plan", entityId: planId, summary: `Updated plan ${data.name} (${formatINR(price)}/${data.interval}). Existing subscribers keep their signup price until renewal review.`, data: { before: { price: before.price, maxLocations: before.maxLocations }, after: values } });
    } else {
      const [row] = await tx.insert(subscriptionPlans).values(values).returning();
      await audit(tx, actor, { action: "plan.created", entityType: "subscription_plan", entityId: row.id, summary: `Created plan ${data.name}` });
    }
  });
}

// ------------------------------------------------------------------ subscriptions

export async function currentSubscription(db: DbOrTx, organisationId: string) {
  const [row] = await db
    .select({ sub: subscriptions, plan: subscriptionPlans })
    .from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId))
    .where(and(eq(subscriptions.organisationId, organisationId), inArray(subscriptions.status, ["trialing", "active", "past_due"])))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return row ?? null;
}

export async function startSubscription(db: Database, actor: Actor, organisationId: string, planId: string) {
  requireOrg(actor, organisationId, "billing.manage");
  const plan = await db.query.subscriptionPlans.findFirst({ where: and(eq(subscriptionPlans.id, planId), eq(subscriptionPlans.isActive, true)) });
  if (!plan) throw new NotFoundError("Plan not available");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM organisations WHERE id = ${organisationId} FOR UPDATE`);
    const existing = await currentSubscription(tx, organisationId);
    if (existing) {
      return changePlan(tx, actor, existing.sub, existing.plan, plan);
    }
    const hadTrial = await tx.query.subscriptions.findFirst({ where: eq(subscriptions.organisationId, organisationId) });
    const now = new Date();
    const trial = !hadTrial && plan.trialDays > 0;
    const periodEnd = trial ? new Date(now.getTime() + plan.trialDays * 86_400_000) : addInterval(now, plan.interval);
    const [sub] = await tx
      .insert(subscriptions)
      .values({
        organisationId,
        planId: plan.id,
        status: trial ? "trialing" : "active",
        priceAtSignup: plan.price,
        trialEndsAt: trial ? periodEnd : null,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      })
      .returning();
    await audit(tx, actor, { action: "subscription.started", entityType: "subscription", entityId: sub.id, organisationId, summary: `${trial ? `Started ${plan.trialDays}-day trial of` : "Subscribed to"} ${plan.name} at ${formatINR(plan.price)}/${plan.interval} + GST` });
    if (!trial) await issueSubscriptionInvoice(tx, sub, plan);
    return sub;
  });
}

/**
 * Upgrades take effect immediately and are invoiced for the new plan's full
 * period from today; downgrades take effect at the next renewal. No proration
 * credit is applied in this release.
 */
async function changePlan(tx: DbOrTx, actor: Actor, sub: Subscription, from: Plan, to: Plan) {
  if (from.id === to.id) throw new ConflictError("You are already on this plan");
  if (to.maxLocations !== null) {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)` }).from(locations).where(and(eq(locations.organisationId, sub.organisationId), eq(locations.status, "active")));
    if (Number(n) > to.maxLocations) throw new ValidationError(`${to.name} allows ${to.maxLocations} active location(s); you have ${n}. Deactivate locations first.`);
  }
  const upgrade = to.price > from.price;
  if (upgrade || sub.status === "trialing") {
    const now = new Date();
    const [updated] = await tx
      .update(subscriptions)
      .set({ planId: to.id, priceAtSignup: to.price, status: sub.status === "trialing" ? "trialing" : sub.status, currentPeriodStart: sub.status === "trialing" ? sub.currentPeriodStart : now, currentPeriodEnd: sub.status === "trialing" ? sub.currentPeriodEnd : addInterval(now, to.interval), cancelAtPeriodEnd: false })
      .where(eq(subscriptions.id, sub.id))
      .returning();
    if (sub.status !== "trialing") await issueSubscriptionInvoice(tx, updated, to);
    await audit(tx, actor, { action: "subscription.plan_changed", entityType: "subscription", entityId: sub.id, organisationId: sub.organisationId, summary: `Changed plan ${from.name} → ${to.name}${sub.status === "trialing" ? " during trial" : " (immediate)"}` });
    return updated;
  }
  // Downgrade: remembered and applied at renewal.
  await tx.update(subscriptions).set({ cancelAtPeriodEnd: false }).where(eq(subscriptions.id, sub.id));
  await tx.execute(sql`INSERT INTO system_settings (key, value) VALUES (${`pending_plan:${sub.id}`}, ${JSON.stringify({ planId: to.id })}::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
  await audit(tx, actor, { action: "subscription.downgrade_scheduled", entityType: "subscription", entityId: sub.id, organisationId: sub.organisationId, summary: `Scheduled change ${from.name} → ${to.name} at next renewal` });
  return sub;
}

export async function cancelSubscription(db: Database, actor: Actor, organisationId: string, reason: string) {
  requireOrg(actor, organisationId, "billing.manage");
  if (!reason.trim()) throw new ValidationError("Tell us why you are cancelling");
  const cur = await currentSubscription(db, organisationId);
  if (!cur) throw new NotFoundError("No active subscription");
  await db.transaction(async (tx) => {
    await tx.update(subscriptions).set({ cancelAtPeriodEnd: true }).where(eq(subscriptions.id, cur.sub.id));
    await audit(tx, actor, { action: "subscription.cancel_requested", entityType: "subscription", entityId: cur.sub.id, organisationId, summary: `Cancellation at period end (${cur.sub.currentPeriodEnd.toISOString().slice(0, 10)}): ${reason.trim()}` });
  });
}

export async function resumeSubscription(db: Database, actor: Actor, organisationId: string) {
  requireOrg(actor, organisationId, "billing.manage");
  const cur = await currentSubscription(db, organisationId);
  if (!cur) throw new NotFoundError("No active subscription");
  await db.update(subscriptions).set({ cancelAtPeriodEnd: false }).where(eq(subscriptions.id, cur.sub.id));
  await audit(db, actor, { action: "subscription.cancel_withdrawn", entityType: "subscription", entityId: cur.sub.id, organisationId, summary: "Withdrew cancellation" });
}

// ------------------------------------------------------------------ invoices

export interface LineInput {
  description: string;
  kind: InvoiceKind;
  amount: number; // before tax, paise
}

export async function gstSplit(db: DbOrTx, billingState: string | null, rateBps: number) {
  const supplierState = await getSetting<string>(db, "supplier_state", "Maharashtra");
  const intra = !!billingState && billingState === supplierState;
  return { intra, note: intra ? `CGST ${rateBps / 200}% + SGST ${rateBps / 200}% (intra-state supply from ${supplierState})` : `IGST ${rateBps / 100}% (inter-state supply)` };
}

const REVENUE_ACCOUNT: Record<InvoiceKind, () => Parameters<typeof ledger.account>[1]> = {
  subscription: ledger.ACCOUNTS.subscriptionRevenue,
  setup_fee: ledger.ACCOUNTS.setupFeeRevenue,
  management_fee: ledger.ACCOUNTS.managementFeeRevenue,
  addon: ledger.ACCOUNTS.addonRevenue,
};

export async function issueInvoice(
  tx: DbOrTx,
  actor: AnyActor,
  opts: { organisationId: string; kind: InvoiceKind; lines: LineInput[]; gstRateBps?: number; subscriptionId?: string | null; campaignId?: string | null; periodStart?: Date | null; periodEnd?: Date | null; dueDays?: number },
) {
  const org = await tx.query.organisations.findFirst({ where: eq(organisations.id, opts.organisationId) });
  if (!org) throw new NotFoundError("Organisation not found");
  const rate = opts.gstRateBps ?? 1800;
  const lines = opts.lines.map((l) => ({ ...l, tax: bps(l.amount, rate) }));
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const tax = lines.reduce((s, l) => s + l.tax, 0);
  if (subtotal <= 0) throw new ValidationError("Invoice total must be positive");
  const { note } = await gstSplit(tx, org.billingState, rate);
  const [{ seq }] = (await tx.execute<{ seq: string }>(sql`SELECT nextval('invoice_number_seq') AS seq`)).rows;
  const number = `AS/${new Date().getUTCFullYear()}/${String(seq).padStart(6, "0")}`;
  const [invoice] = await tx
    .insert(invoices)
    .values({
      organisationId: opts.organisationId,
      number,
      kind: opts.kind,
      status: "issued",
      subscriptionId: opts.subscriptionId ?? null,
      campaignId: opts.campaignId ?? null,
      periodStart: opts.periodStart ?? null,
      periodEnd: opts.periodEnd ?? null,
      subtotal,
      tax,
      total: subtotal + tax,
      taxNote: `${note}${org.gstin ? `; recipient GSTIN ${org.gstin}` : ""}`,
      dueAt: new Date(Date.now() + (opts.dueDays ?? 7) * 86_400_000),
    })
    .returning();
  await tx.insert(invoiceLines).values(lines.map((l) => ({ invoiceId: invoice.id, description: l.description, kind: l.kind, amount: l.amount, tax: l.tax })));
  const receivable = await ledger.account(tx, ledger.ACCOUNTS.receivable(opts.organisationId));
  const legs: ledger.Leg[] = [{ account: receivable, debit: subtotal + tax }];
  for (const kind of Array.from(new Set(lines.map((l) => l.kind)))) {
    legs.push({ account: await ledger.account(tx, REVENUE_ACCOUNT[kind]()), credit: lines.filter((l) => l.kind === kind).reduce((s, l) => s + l.amount, 0) });
  }
  if (tax > 0) legs.push({ account: await ledger.account(tx, ledger.ACCOUNTS.gstOutput()), credit: tax });
  await ledger.post(tx, actor, { type: "invoice_issued", memo: `Invoice ${number} issued (${formatINR(subtotal + tax)} incl. GST)`, legs, idempotencyKey: `invoice:${invoice.id}`, organisationId: opts.organisationId });
  await notify(tx, { organisationId: opts.organisationId, kind: "invoice_issued", title: `Invoice ${number}`, body: `${formatINR(subtotal + tax)} due by ${invoice.dueAt!.toISOString().slice(0, 10)}.`, link: `/app/billing/invoices/${invoice.id}`, dedupeKey: `invoice_issued:${invoice.id}` });
  return invoice;
}

async function issueSubscriptionInvoice(tx: DbOrTx, sub: Subscription, plan: Plan) {
  const amount = sub.priceAtSignup - bps(sub.priceAtSignup, sub.discountBps);
  return issueInvoice(tx, SYSTEM, {
    organisationId: sub.organisationId,
    kind: "subscription",
    lines: [{ description: `${plan.name} plan, ${sub.currentPeriodStart.toISOString().slice(0, 10)} to ${sub.currentPeriodEnd.toISOString().slice(0, 10)}${sub.discountBps ? ` (discount ${sub.discountBps / 100}%)` : ""}`, kind: "subscription", amount }],
    gstRateBps: plan.gstRateBps,
    subscriptionId: sub.id,
    periodStart: sub.currentPeriodStart,
    periodEnd: sub.currentPeriodEnd,
  });
}

const serviceInvoiceSchema = z.object({
  kind: z.enum(["setup_fee", "management_fee", "addon"]),
  description: requiredText("Description", 300),
  amount: z.string(),
  campaignId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
});

/** Finance or campaign ops bill a service fee. Never charged from advertising funds. */
export async function issueServiceInvoice(db: Database, actor: Actor, organisationId: string, input: unknown) {
  requirePlatform(actor, "platform.finance");
  const data = parse(serviceInvoiceSchema, input);
  const amount = parseRupees(data.amount);
  return db.transaction(async (tx) => {
    const inv = await issueInvoice(tx, actor, { organisationId, kind: data.kind, lines: [{ description: data.description, kind: data.kind, amount }], campaignId: data.campaignId ?? null });
    await audit(tx, actor, { action: "invoice.service_issued", entityType: "invoice", entityId: inv.id, organisationId, summary: `Issued ${data.kind.replace("_", " ")} invoice ${inv.number} for ${formatINR(amount)} + GST` });
    return inv;
  });
}

export async function voidInvoice(db: Database, actor: Actor, invoiceId: string, reason: string) {
  requirePlatform(actor, "platform.finance");
  if (!reason.trim()) throw new ValidationError("Give a reason");
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!inv) throw new NotFoundError("Invoice not found");
  if (inv.status !== "issued") throw new ConflictError("Only unpaid invoices can be voided");
  await db.transaction(async (tx) => {
    const lines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id));
    const legs: ledger.Leg[] = [{ account: await ledger.account(tx, ledger.ACCOUNTS.receivable(inv.organisationId)), credit: inv.total }];
    for (const kind of Array.from(new Set(lines.map((l) => l.kind)))) {
      legs.push({ account: await ledger.account(tx, REVENUE_ACCOUNT[kind]()), debit: lines.filter((l) => l.kind === kind).reduce((s, l) => s + l.amount, 0) });
    }
    if (inv.tax > 0) legs.push({ account: await ledger.account(tx, ledger.ACCOUNTS.gstOutput()), debit: inv.tax });
    await ledger.post(tx, actor, { type: "invoice_voided", memo: `Invoice ${inv.number} voided: ${reason.trim()}`, legs, idempotencyKey: `invoice_void:${inv.id}`, organisationId: inv.organisationId });
    await tx.update(invoices).set({ status: "void" }).where(eq(invoices.id, inv.id));
    await audit(tx, actor, { action: "invoice.voided", entityType: "invoice", entityId: inv.id, organisationId: inv.organisationId, summary: `Voided ${inv.number}: ${reason.trim()}` });
  });
}

export async function listInvoices(db: DbOrTx, actor: Actor, organisationId: string) {
  requireOrg(actor, organisationId, "billing.view");
  return db.select().from(invoices).where(eq(invoices.organisationId, organisationId)).orderBy(desc(invoices.issuedAt));
}

export async function getInvoice(db: DbOrTx, actor: Actor, invoiceId: string) {
  const inv = await db.query.invoices.findFirst({ where: eq(invoices.id, invoiceId) });
  if (!inv) throw new NotFoundError("Not found");
  requireOrg(actor, inv.organisationId, "billing.view");
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, inv.id));
  const org = await db.query.organisations.findFirst({ where: eq(organisations.id, inv.organisationId) });
  return { invoice: inv, lines, organisation: org! };
}

export async function payInvoice(db: Database, actor: Actor, invoiceId: string) {
  const { invoice } = await getInvoice(db, actor, invoiceId);
  requireOrg(actor, invoice.organisationId, "billing.manage");
  if (invoice.status !== "issued") throw new ConflictError("This invoice is not payable");
  return createPayment(db, actor, { organisationId: invoice.organisationId, purpose: "invoice", amount: invoice.total, invoiceId: invoice.id, idempotencyKey: `invoice:${invoice.id}:${Math.floor(Date.now() / 3_600_000)}` });
}

// ------------------------------------------------------------------ daily billing cycle (job)

/** Trials ending, renewals, cancellations, overdue invoices and reminders. Safe to run repeatedly. */
export async function runBillingCycle(db: Database, now = new Date()) {
  const due = await db
    .select({ sub: subscriptions, plan: subscriptionPlans })
    .from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptions.planId))
    .where(and(inArray(subscriptions.status, ["trialing", "active", "past_due"]), lte(subscriptions.currentPeriodEnd, now)));
  for (const { sub, plan } of due) {
    await db.transaction(async (tx) => {
      if (sub.cancelAtPeriodEnd) {
        await tx.update(subscriptions).set({ status: "cancelled", cancelledAt: now }).where(eq(subscriptions.id, sub.id));
        await audit(tx, SYSTEM, { action: "subscription.cancelled", entityType: "subscription", entityId: sub.id, organisationId: sub.organisationId, summary: "Subscription ended at period end" });
        await notify(tx, { organisationId: sub.organisationId, kind: "subscription_cancelled", title: "Subscription ended", body: `Your ${plan.name} subscription has ended. Your data remains available for export.`, link: "/app/billing", dedupeKey: `sub_cancelled:${sub.id}` });
        return;
      }
      const pending = await tx.execute<{ value: { planId: string } }>(sql`SELECT value FROM system_settings WHERE key = ${`pending_plan:${sub.id}`}`);
      let nextPlan = plan;
      const pendingPlanId = pending.rows[0]?.value?.planId;
      if (pendingPlanId) {
        const p = await tx.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.id, pendingPlanId) });
        if (p) nextPlan = p;
        await tx.execute(sql`DELETE FROM system_settings WHERE key = ${`pending_plan:${sub.id}`}`);
      }
      const start = sub.currentPeriodEnd;
      const [renewed] = await tx
        .update(subscriptions)
        .set({ planId: nextPlan.id, priceAtSignup: nextPlan.id === plan.id ? sub.priceAtSignup : nextPlan.price, status: sub.status === "past_due" ? "past_due" : "active", trialEndsAt: null, currentPeriodStart: start, currentPeriodEnd: addInterval(start, nextPlan.interval) })
        .where(eq(subscriptions.id, sub.id))
        .returning();
      await issueSubscriptionInvoice(tx, renewed, nextPlan);
      await audit(tx, SYSTEM, { action: sub.status === "trialing" ? "subscription.trial_converted" : "subscription.renewed", entityType: "subscription", entityId: sub.id, organisationId: sub.organisationId, summary: `${sub.status === "trialing" ? "Trial ended" : "Renewed"}: ${nextPlan.name}` });
    });
  }
  // Overdue invoices put the subscription past due.
  const overdue = await db.select().from(invoices).where(and(eq(invoices.status, "issued"), lt(invoices.dueAt, now)));
  for (const inv of overdue) {
    if (inv.subscriptionId) await db.update(subscriptions).set({ status: "past_due" }).where(and(eq(subscriptions.id, inv.subscriptionId), eq(subscriptions.status, "active")));
    await notify(db, { organisationId: inv.organisationId, kind: "invoice_overdue", severity: "warning", title: `Invoice ${inv.number} is overdue`, body: `${formatINR(inv.total)} was due on ${inv.dueAt!.toISOString().slice(0, 10)}.`, link: `/app/billing/invoices/${inv.id}`, dedupeKey: `overdue:${inv.id}:${now.toISOString().slice(0, 10)}` });
  }
  // Renewal reminders three days ahead.
  const soon = await db
    .select()
    .from(subscriptions)
    .where(and(inArray(subscriptions.status, ["trialing", "active"]), lte(subscriptions.currentPeriodEnd, new Date(now.getTime() + 3 * 86_400_000)), eq(subscriptions.cancelAtPeriodEnd, false)));
  for (const s of soon) {
    await notify(db, { organisationId: s.organisationId, kind: "renewal_reminder", title: s.status === "trialing" ? "Your trial ends soon" : "Subscription renews soon", body: `On ${s.currentPeriodEnd.toISOString().slice(0, 10)} we will issue your next invoice.`, link: "/app/billing", dedupeKey: `renewal:${s.id}:${s.currentPeriodEnd.toISOString().slice(0, 10)}` });
  }
  return { renewed: due.length, overdue: overdue.length };
}

export async function setDiscount(db: Database, actor: Actor, subscriptionId: string, discountBps: number, reason: string) {
  requirePlatform(actor, "platform.admin");
  if (discountBps < 0 || discountBps > 10_000) throw new ValidationError("Discount must be between 0% and 100%");
  if (!reason.trim()) throw new ValidationError("Give a reason");
  const sub = await db.query.subscriptions.findFirst({ where: eq(subscriptions.id, subscriptionId) });
  if (!sub) throw new NotFoundError("Subscription not found");
  await db.update(subscriptions).set({ discountBps }).where(eq(subscriptions.id, subscriptionId));
  await audit(db, actor, { action: "subscription.discount_set", entityType: "subscription", entityId: subscriptionId, organisationId: sub.organisationId, summary: `Discount ${discountBps / 100}% from next invoice: ${reason.trim()}` });
}
