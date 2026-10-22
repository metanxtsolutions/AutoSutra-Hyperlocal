import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { advertisingDeposits, campaignPlatforms, featureFlags, invoices, ledgerEntries, ledgerLines, organisations, payments, subscriptionPlans, subscriptions } from "@/server/db/schema";
import { setGatewayForTests } from "@/server/payments";
import { MockGateway } from "@/server/payments/mock";
import * as ledger from "@/server/services/ledger";
import * as wallet from "@/server/services/wallet";
import * as billing from "@/server/services/billing";
import * as recon from "@/server/services/reconciliation";
import * as campaigns from "@/server/services/campaigns";
import { handleWebhook } from "@/server/services/payments";
import { actorFor, addMember, expectDbError, makeTenant, makeUser, readyCampaign } from "./helpers";

const gw = new MockGateway("test-webhook-secret");

async function enableWallet() {
  await getDb().insert(featureFlags).values({ key: "central_wallet", enabled: true, description: "test" }).onConflictDoNothing();
}

async function verifiedTenant(name = "Solo") {
  const t = await makeTenant(name);
  await getDb().update(organisations).set({ verificationStatus: "verified", billingState: "Maharashtra" }).where(eq(organisations.id, t.org.id));
  return t;
}

function headersFor(signature: string) {
  return new Headers({ "x-mock-signature": signature });
}

async function deposit(t: Awaited<ReturnType<typeof makeTenant>>, rupees: number, key = `req-${Math.random().toString(36).slice(2, 12)}`) {
  const db = getDb();
  const { payment } = await wallet.startDeposit(db, t.actor, t.org.id, { amount: String(rupees), requestKey: key });
  const evt = gw.simulate({ type: "payment.captured", order_id: payment.gatewayOrderId, payment_id: `pay_${key}`, amount: payment.amount, fee: 236, tax: 36 });
  const r = await handleWebhook(db, "mock", evt.body, headersFor(evt.signature));
  return { payment, evt, result: r };
}

beforeEach(() => setGatewayForTests(gw));
afterEach(() => setGatewayForTests(null));

describe("deposits and webhooks", () => {
  it("refuses deposits unless the central wallet is enabled and the organisation verified", async () => {
    const db = getDb();
    const t = await makeTenant("Solo");
    await expect(wallet.startDeposit(db, t.actor, t.org.id, { amount: "5000", requestKey: "abcdefgh1" })).rejects.toThrow(/not enabled/);
    await enableWallet();
    await expect(wallet.startDeposit(db, t.actor, t.org.id, { amount: "5000", requestKey: "abcdefgh1" })).rejects.toThrow(/must be verified/);
    await db.update(organisations).set({ verificationStatus: "verified" }).where(eq(organisations.id, t.org.id));
    await expect(wallet.startDeposit(db, t.actor, t.org.id, { amount: "50", requestKey: "abcdefgh1" })).rejects.toThrow(/minimum deposit/);
  });

  it("credits only after a verified webhook, once, and keeps gateway fees as AutoSutra cost", async () => {
    const db = getDb();
    await enableWallet();
    const t = await verifiedTenant();
    const { payment } = await wallet.startDeposit(db, t.actor, t.org.id, { amount: "25000", requestKey: "deposit-0001" });
    // Same request key: same payment (idempotent initiation).
    const again = await wallet.startDeposit(db, t.actor, t.org.id, { amount: "25000", requestKey: "deposit-0001" });
    expect(again.payment.id).toBe(payment.id);
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.available(t.org.id).code)).toBe(0); // nothing credited on initiation

    const evt = gw.simulate({ type: "payment.captured", order_id: payment.gatewayOrderId, payment_id: "pay_1", amount: payment.amount, fee: 590, tax: 90 });
    // Forged signature is rejected and changes nothing.
    expect((await handleWebhook(db, "mock", evt.body, headersFor("0".repeat(64)))).status).toBe(401);
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.available(t.org.id).code)).toBe(0);

    expect((await handleWebhook(db, "mock", evt.body, headersFor(evt.signature))).outcome).toBe("captured");
    expect((await handleWebhook(db, "mock", evt.body, headersFor(evt.signature))).outcome).toBe("duplicate_ignored");
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.available(t.org.id).code)).toBe(25000_00);
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.gatewayFees().code)).toBe(590);
    const dep = await db.query.advertisingDeposits.findFirst({ where: eq(advertisingDeposits.paymentId, payment.id) });
    expect(dep!.status).toBe("confirmed");
    // Customer funds are liabilities, never revenue.
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.subscriptionRevenue().code)).toBe(0);
    const balances = await ledger.orgBalances(db, t.org.id);
    expect(balances.totalDeposits).toBe(25000_00);
  });

  it("does not credit a payment whose captured amount differs", async () => {
    const db = getDb();
    await enableWallet();
    const t = await verifiedTenant();
    const { payment } = await wallet.startDeposit(db, t.actor, t.org.id, { amount: "10000", requestKey: "deposit-0002" });
    const evt = gw.simulate({ type: "payment.captured", order_id: payment.gatewayOrderId, payment_id: "pay_x", amount: 100 });
    expect((await handleWebhook(db, "mock", evt.body, headersFor(evt.signature))).outcome).toBe("amount_mismatch_not_credited");
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.available(t.org.id).code)).toBe(0);
  });

  it("records failed payments without crediting", async () => {
    const db = getDb();
    await enableWallet();
    const t = await verifiedTenant();
    const { payment } = await wallet.startDeposit(db, t.actor, t.org.id, { amount: "10000", requestKey: "deposit-0003" });
    const evt = gw.simulate({ type: "payment.failed", order_id: payment.gatewayOrderId, payment_id: "pay_f", failure_reason: "Card declined" });
    expect((await handleWebhook(db, "mock", evt.body, headersFor(evt.signature))).outcome).toBe("payment_failed");
    const p = await db.query.payments.findFirst({ where: eq(payments.id, payment.id) });
    expect(p!.status).toBe("failed");
    expect((await db.query.advertisingDeposits.findFirst({ where: eq(advertisingDeposits.paymentId, payment.id) }))!.status).toBe("failed");
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.available(t.org.id).code)).toBe(0);
  });
});

describe("reservations", () => {
  it("reserves on approval, waits for funds when short, and keeps platform allocations separate", async () => {
    const db = getDb();
    await enableWallet();
    const t = await verifiedTenant();
    const c = await readyCampaign(t, { providers: ["meta", "google"], budgetRupees: 10000 });
    await campaigns.submitForApproval(db, t.actor, c.id);
    const full = await campaigns.loadCampaign(db, c.id);
    const res = await campaigns.approve(db, t.actor, c.id, { confirmBudget: true, confirmClaims: true, expectedHash: campaigns.hashSnapshot(campaigns.configSnapshot(full!)) });
    expect(res.status).toBe("pending_funding");
    await expect(campaigns.retryFunding(db, t.actor, c.id)).rejects.toThrow(/Still short/);
    await deposit(t, 25000);
    await campaigns.retryFunding(db, t.actor, c.id);
    const after = await campaigns.loadCampaign(db, c.id);
    expect(after!.campaign.status).toBe("ready_to_publish");
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.available(t.org.id).code)).toBe(5000_00);
    for (const { platform } of after!.platforms) {
      expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.reserved(t.org.id, platform.id, platform.provider).code)).toBe(10000_00);
    }
    // Cancelling releases both reservations.
    await campaigns.cancel(db, t.actor, c.id, { reason: "Changed plans" });
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.available(t.org.id).code)).toBe(25000_00);
  });

  it("never over-allocates under concurrent approvals", async () => {
    const db = getDb();
    await enableWallet();
    const t = await verifiedTenant();
    await deposit(t, 15000);
    const a = await readyCampaign(t, { budgetRupees: 10000 });
    const b = await readyCampaign(t, { budgetRupees: 10000 });
    for (const c of [a, b]) await campaigns.submitForApproval(db, t.actor, c.id);
    const hashes = await Promise.all([a, b].map(async (c) => campaigns.hashSnapshot(campaigns.configSnapshot((await campaigns.loadCampaign(db, c.id))!))));
    const results = await Promise.all([a, b].map((c, i) => campaigns.approve(db, t.actor, c.id, { confirmBudget: true, confirmClaims: true, expectedHash: hashes[i] })));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual(["pending_funding", "ready_to_publish"]);
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.available(t.org.id).code)).toBe(5000_00);
  });

  it("recognises reported spend up to the reservation and flags overspend in reconciliation", async () => {
    const db = getDb();
    await enableWallet();
    const t = await verifiedTenant();
    await deposit(t, 20000);
    const c = await readyCampaign(t, { budgetRupees: 10000 });
    await campaigns.submitForApproval(db, t.actor, c.id);
    const full = await campaigns.loadCampaign(db, c.id);
    await campaigns.approve(db, t.actor, c.id, { confirmBudget: true, confirmClaims: true, expectedHash: campaigns.hashSnapshot(campaigns.configSnapshot(full!)) });
    const p = full!.platforms[0].platform;
    await db.transaction((tx) => ledger.recogniseMediaSpend(tx, { system: "test" }, { organisationId: t.org.id, campaignId: c.id, platformId: p.id, provider: "meta", cumulativeReported: 4000_00 }));
    await db.transaction((tx) => ledger.recogniseMediaSpend(tx, { system: "test" }, { organisationId: t.org.id, campaignId: c.id, platformId: p.id, provider: "meta", cumulativeReported: 4000_00 })); // idempotent
    expect(await ledger.recognisedSpend(db, p.id)).toBe(4000_00);
    await db.transaction((tx) => ledger.recogniseMediaSpend(tx, { system: "test" }, { organisationId: t.org.id, campaignId: c.id, platformId: p.id, provider: "meta", cumulativeReported: 11000_00 }));
    expect(await ledger.recognisedSpend(db, p.id)).toBe(10000_00); // capped at the reservation
    await db.update(campaignPlatforms).set({ reportedSpend: 11000_00 }).where(eq(campaignPlatforms.id, p.id));

    const run = await recon.runReconciliation(db, { system: "test" });
    expect(run.summary.trialBalance.balanced).toBe(true);
    const diffs = await recon.listDifferences(db, await actorFor((await makeUser({ platformRole: "finance_admin" })).id));
    const over = diffs.find((d) => d.d.kind === "overspend")!;
    expect(over.d.amount).toBe(1000_00);
    // Running again does not duplicate the open difference.
    await recon.runReconciliation(db, { system: "test" });
    expect((await recon.listDifferences(db, await actorFor((await makeUser({ platformRole: "finance_admin" })).id))).filter((d) => d.d.kind === "overspend")).toHaveLength(1);

    // Two-person rule for adjustments.
    const f1 = await actorFor((await makeUser({ platformRole: "finance_admin" })).id);
    const f2 = await actorFor((await makeUser({ platformRole: "finance_admin" })).id);
    await recon.proposeAdjustment(db, f1, over.d.id, { kind: "charge_customer_overspend", amount: "1000", note: "Customer agreed by email" });
    await expect(recon.approveAdjustment(db, f1, over.d.id)).rejects.toThrow(/different finance user/);
    await recon.approveAdjustment(db, f2, over.d.id);
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.mediaPayable("meta").code)).toBe(11000_00);
    expect((await ledger.trialBalance(db)).balanced).toBe(true);
  });
});

describe("refunds", () => {
  it("requires finance approval with amount confirmation and settles through the gateway", async () => {
    const db = getDb();
    await enableWallet();
    const t = await verifiedTenant();
    await deposit(t, 20000);
    const finance = await actorFor((await makeUser({ platformRole: "finance_admin" })).id);
    await expect(wallet.requestRefund(db, t.actor, t.org.id, { amount: "30000", reason: "Too much" })).rejects.toThrow(/up to your unallocated balance/);
    const r = await wallet.requestRefund(db, t.actor, t.org.id, { amount: "5000", reason: "Season over" });
    await expect(wallet.decideRefund(db, finance, r.id, { decision: "approve", confirmAmount: "500" })).rejects.toThrow(/exact refund amount/);
    await wallet.decideRefund(db, finance, r.id, { decision: "approve", confirmAmount: "5000" });
    const done = (await wallet.walletOverview(db, t.actor, t.org.id)).refunds.find((x) => x.id === r.id)!;
    expect(done.status).toBe("completed");
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.available(t.org.id).code)).toBe(15000_00);
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.refundPending(t.org.id).code)).toBe(0);
    await expect(wallet.decideRefund(db, finance, r.id, { decision: "approve", confirmAmount: "5000" })).rejects.toThrow(/already been decided/);
  });

  it("returns held funds when a refund fails", async () => {
    const db = getDb();
    await enableWallet();
    const t = await verifiedTenant();
    await deposit(t, 20000);
    const finance = await actorFor((await makeUser({ platformRole: "finance_admin" })).id);
    const failing = new MockGateway("test-webhook-secret");
    failing.refund = async () => ({ refundId: "rf_1", status: "pending" });
    setGatewayForTests(failing);
    const r = await wallet.requestRefund(db, t.actor, t.org.id, { amount: "5000", reason: "x" });
    await wallet.decideRefund(db, finance, r.id, { decision: "approve", confirmAmount: "5000" });
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.refundPending(t.org.id).code)).toBe(5000_00);
    const evt = failing.simulate({ type: "refund.failed", refund_id: "rf_1" });
    await handleWebhook(db, "mock", evt.body, headersFor(evt.signature));
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.available(t.org.id).code)).toBe(20000_00);
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.refundPending(t.org.id).code)).toBe(0);
  });

  it("blocks non-finance users and the requester from deciding", async () => {
    const db = getDb();
    await enableWallet();
    const t = await verifiedTenant();
    await deposit(t, 20000);
    const r = await wallet.requestRefund(db, t.actor, t.org.id, { amount: "1000", reason: "x" });
    await expect(wallet.decideRefund(db, t.actor, r.id, { decision: "approve", confirmAmount: "1000" })).rejects.toThrow(/staff permissions/);
    const ops = await actorFor((await makeUser({ platformRole: "campaign_ops" })).id);
    await expect(wallet.decideRefund(db, ops, r.id, { decision: "approve", confirmAmount: "1000" })).rejects.toThrow(/staff permissions/);
  });
});

describe("ledger immutability", () => {
  it("rejects edits, deletes and unbalanced entries at the database level", async () => {
    const db = getDb();
    await enableWallet();
    const t = await verifiedTenant();
    await deposit(t, 5000);
    const [entry] = await db.select().from(ledgerEntries).limit(1);
    await expectDbError(db.update(ledgerEntries).set({ memo: "edited" }).where(eq(ledgerEntries.id, entry.id)), /append-only/);
    await expectDbError(db.update(ledgerLines).set({ debit: 1 }).where(eq(ledgerLines.entryId, entry.id)), /append-only/);
    await expectDbError(db.execute(sql`DELETE FROM ledger_entries`), /append-only/);
    const acct = await ledger.account(db, ledger.ACCOUNTS.suspense());
    await expectDbError(
      db.transaction(async (tx) => {
        const [e] = await tx.insert(ledgerEntries).values({ transactionId: "TXN-BAD", type: "test", memo: "unbalanced", amount: 100, idempotencyKey: "bad" }).returning();
        await tx.insert(ledgerLines).values({ entryId: e.id, accountId: acct.id, debit: 100, credit: 0 });
      }),
      /does not balance/,
    );
    await expect(ledger.post(db, { system: "t" }, { type: "x", memo: "x", legs: [{ account: acct, debit: 5 }, { account: acct, credit: 4 }], idempotencyKey: "x" })).rejects.toThrow(/does not balance/);
  });
});

describe("subscriptions and invoices", () => {
  it("starts a trial, converts to a paid invoice with GST, and records payment as operating revenue", async () => {
    const db = getDb();
    const t = await verifiedTenant();
    const plan = await db.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.code, "growth") });
    const sub = await billing.startSubscription(db, t.actor, t.org.id, plan!.id);
    expect(sub.status).toBe("trialing");
    // Fast-forward to the end of the trial.
    await db.update(subscriptions).set({ currentPeriodEnd: new Date(Date.now() - 1000) }).where(eq(subscriptions.id, sub.id));
    await billing.runBillingCycle(db);
    await billing.runBillingCycle(db); // idempotent: no second invoice for the same period
    const invs = await db.select().from(invoices).where(eq(invoices.organisationId, t.org.id));
    expect(invs).toHaveLength(1);
    expect(invs[0]).toMatchObject({ subtotal: 7999_00, tax: 1439_82, total: 9438_82, kind: "subscription" });
    expect(invs[0].taxNote).toMatch(/CGST 9% \+ SGST 9%/);
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.subscriptionRevenue().code)).toBe(7999_00);
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.gstOutput().code)).toBe(1439_82);

    const payment = await billing.payInvoice(db, t.actor, invs[0].id);
    const evt = gw.simulate({ type: "payment.captured", order_id: payment.gatewayOrderId, payment_id: "pay_inv", amount: payment.amount });
    await handleWebhook(db, "mock", evt.body, headersFor(evt.signature));
    expect((await db.query.invoices.findFirst({ where: eq(invoices.id, invs[0].id) }))!.status).toBe("paid");
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.receivable(t.org.id).code)).toBe(0);
    // Subscription money never touches client advertising funds.
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.gatewayClientClearing().code)).toBe(0);
    expect(await ledger.balanceByCode(db, ledger.ACCOUNTS.gatewayOperatingClearing().code)).toBe(9438_82);
  });

  it("uses IGST for other states, enforces plan location limits and handles cancellation", async () => {
    const db = getDb();
    const t = await verifiedTenant();
    await db.update(organisations).set({ billingState: "Karnataka" }).where(eq(organisations.id, t.org.id));
    const starter = await db.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.code, "starter") });
    const growth = await db.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.code, "growth") });
    await db.update(subscriptionPlans).set({ trialDays: 0 }).where(eq(subscriptionPlans.code, "growth"));
    await billing.startSubscription(db, t.actor, t.org.id, growth!.id);
    const [inv] = await db.select().from(invoices).where(eq(invoices.organisationId, t.org.id));
    expect(inv.taxNote).toMatch(/IGST 18%/);
    // Downgrade to Starter (1 location) is fine with one location; it applies at renewal.
    await billing.startSubscription(db, t.actor, t.org.id, starter!.id);
    expect((await billing.currentSubscription(db, t.org.id))!.plan.code).toBe("growth");
    await billing.cancelSubscription(db, t.actor, t.org.id, "Closing branch");
    const cur = await billing.currentSubscription(db, t.org.id);
    await db.update(subscriptions).set({ currentPeriodEnd: new Date(Date.now() - 1000) }).where(eq(subscriptions.id, cur!.sub.id));
    await billing.runBillingCycle(db);
    expect(await billing.currentSubscription(db, t.org.id)).toBeNull();
  });

  it("restricts billing management to permitted roles", async () => {
    const db = getDb();
    const t = await verifiedTenant();
    const sales = await makeUser();
    await addMember(t.org.id, sales.id, "sales_user");
    const plan = await db.query.subscriptionPlans.findFirst({ where: eq(subscriptionPlans.code, "starter") });
    await expect(billing.startSubscription(db, await actorFor(sales.id, t.org.id), t.org.id, plan!.id)).rejects.toThrow(/role does not allow/);
  });
});
