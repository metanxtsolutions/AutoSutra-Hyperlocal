/**
 * Double-entry ledger.
 *
 * The ledger records money AutoSutra holds or is owed, separated by category so
 * customer advertising funds are never confused with AutoSutra revenue.
 * Provider-reported media spend is observational data stored elsewhere
 * (campaign_platforms.reported_spend, provider_spend_records); it reaches the
 * ledger only when `recogniseMediaSpend` posts it, and reconciliation compares
 * the two.
 *
 * Guarantees
 * - Every entry balances (also enforced by a deferred database trigger).
 * - Entries and lines are immutable (database triggers); corrections are
 *   compensating entries.
 * - Every entry has a unique idempotency key, so retries and duplicate
 *   webhooks never double-post.
 * - Balance checks lock the account row (SELECT ... FOR UPDATE) inside the
 *   caller's transaction, so concurrent reservations cannot overdraw.
 *
 * Chart of accounts (code → category)
 *   clearing:gateway:client            asset     payments received for ad budgets, awaiting settlement
 *   clearing:gateway:operating         asset     payments received for invoices, awaiting settlement
 *   bank:client_funds                  asset     settled customer advertising funds
 *   bank:operating                     asset     AutoSutra's own funds
 *   receivable:org:{id}                asset     invoiced and unpaid AutoSutra fees
 *   expense:gateway_fees               expense   payment gateway charges borne by AutoSutra
 *   org:{id}:available                 liability unallocated customer advertising balance
 *   org:{id}:reserved:{platformId}     liability budget reserved for one campaign platform
 *   org:{id}:refund_pending            liability refunds approved and in progress
 *   media_payable:{provider}           liability recognised spend owed to an ad platform
 *   tax:gst_output                     liability GST charged on AutoSutra invoices
 *   suspense:reconciliation            liability reconciliation differences under review
 *   revenue:subscription               revenue   software subscriptions
 *   revenue:management_fees            revenue   managed-service fees
 *   revenue:setup_fees                 revenue   onboarding / setup fees
 *   revenue:addons                     revenue   optional add-on services
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { ledgerAccounts, ledgerEntries, ledgerLines } from "../db/schema";
import { audit } from "../audit";
import { isSystem, type AnyActor } from "../auth/context";
import { formatINR } from "@/lib/money";
import { ConflictError, ValidationError } from "../errors";

export type AccountType = "asset" | "liability" | "revenue" | "expense";
export type Provider = "meta" | "google";

interface AccountSpec {
  code: string;
  name: string;
  type: AccountType;
  category: string;
  organisationId?: string | null;
  campaignPlatformId?: string | null;
  provider?: Provider | null;
}

export const ACCOUNTS = {
  gatewayClientClearing: (): AccountSpec => ({ code: "clearing:gateway:client", name: "Gateway clearing (advertising deposits)", type: "asset", category: "customer_advertising_deposits" }),
  gatewayOperatingClearing: (): AccountSpec => ({ code: "clearing:gateway:operating", name: "Gateway clearing (AutoSutra invoices)", type: "asset", category: "operating_receipts" }),
  clientFundsBank: (): AccountSpec => ({ code: "bank:client_funds", name: "Client funds bank account", type: "asset", category: "customer_advertising_deposits" }),
  operatingBank: (): AccountSpec => ({ code: "bank:operating", name: "Operating bank account", type: "asset", category: "operating_funds" }),
  receivable: (orgId: string): AccountSpec => ({ code: `receivable:org:${orgId}`, name: "Invoices receivable", type: "asset", category: "accounts_receivable", organisationId: orgId }),
  gatewayFees: (): AccountSpec => ({ code: "expense:gateway_fees", name: "Payment gateway fees", type: "expense", category: "payment_gateway_fees" }),
  available: (orgId: string): AccountSpec => ({ code: `org:${orgId}:available`, name: "Unallocated advertising balance", type: "liability", category: "unallocated_balance", organisationId: orgId }),
  reserved: (orgId: string, platformId: string, provider: Provider): AccountSpec => ({
    code: `org:${orgId}:reserved:${platformId}`,
    name: `Campaign budget reservation (${provider})`,
    type: "liability",
    category: "campaign_budget_reservation",
    organisationId: orgId,
    campaignPlatformId: platformId,
    provider,
  }),
  refundPending: (orgId: string): AccountSpec => ({ code: `org:${orgId}:refund_pending`, name: "Refunds in progress", type: "liability", category: "refunds", organisationId: orgId }),
  mediaPayable: (provider: Provider): AccountSpec => ({ code: `media_payable:${provider}`, name: `Advertising spend payable to ${provider}`, type: "liability", category: "advertising_spend", provider }),
  gstOutput: (): AccountSpec => ({ code: "tax:gst_output", name: "GST output tax payable", type: "liability", category: "taxes" }),
  suspense: (): AccountSpec => ({ code: "suspense:reconciliation", name: "Reconciliation suspense", type: "liability", category: "reconciliation_differences" }),
  subscriptionRevenue: (): AccountSpec => ({ code: "revenue:subscription", name: "Subscription revenue", type: "revenue", category: "subscription_revenue" }),
  managementFeeRevenue: (): AccountSpec => ({ code: "revenue:management_fees", name: "Management fee revenue", type: "revenue", category: "management_fee_revenue" }),
  setupFeeRevenue: (): AccountSpec => ({ code: "revenue:setup_fees", name: "Setup fee revenue", type: "revenue", category: "setup_fee_revenue" }),
  addonRevenue: (): AccountSpec => ({ code: "revenue:addons", name: "Add-on service revenue", type: "revenue", category: "addon_revenue" }),
} as const;

export class LedgerError extends ValidationError {}

export async function account(db: DbOrTx, spec: AccountSpec) {
  const existing = await db.query.ledgerAccounts.findFirst({ where: eq(ledgerAccounts.code, spec.code) });
  if (existing) return existing;
  await db
    .insert(ledgerAccounts)
    .values({
      code: spec.code,
      name: spec.name,
      type: spec.type,
      category: spec.category,
      organisationId: spec.organisationId ?? null,
      campaignPlatformId: spec.campaignPlatformId ?? null,
      provider: spec.provider ?? null,
    })
    .onConflictDoNothing({ target: ledgerAccounts.code });
  const row = await db.query.ledgerAccounts.findFirst({ where: eq(ledgerAccounts.code, spec.code) });
  if (!row) throw new Error(`Could not create ledger account ${spec.code}`);
  return row;
}

type AccountRow = typeof ledgerAccounts.$inferSelect;

export async function balanceOf(db: DbOrTx, acct: Pick<AccountRow, "id" | "type">): Promise<number> {
  const [row] = await db
    .select({
      d: sql<string>`coalesce(sum(${ledgerLines.debit}), 0)`,
      c: sql<string>`coalesce(sum(${ledgerLines.credit}), 0)`,
    })
    .from(ledgerLines)
    .where(eq(ledgerLines.accountId, acct.id));
  const d = Number(row.d);
  const c = Number(row.c);
  return acct.type === "asset" || acct.type === "expense" ? d - c : c - d;
}

/** Balance by code without creating the account (safe for read-only pages). */
export async function balanceByCode(db: DbOrTx, code: string): Promise<number> {
  const acct = await db.query.ledgerAccounts.findFirst({ where: eq(ledgerAccounts.code, code) });
  return acct ? balanceOf(db, acct) : 0;
}

/** Lock an account row for the rest of the transaction before checking its balance. */
export async function lockAccount(db: DbOrTx, acct: AccountRow): Promise<void> {
  await db.execute(sql`SELECT id FROM ledger_accounts WHERE id = ${acct.id} FOR UPDATE`);
}

export interface Leg {
  account: AccountRow;
  debit?: number;
  credit?: number;
}

export interface PostInput {
  type: string;
  memo: string;
  legs: Leg[];
  idempotencyKey: string;
  organisationId?: string | null;
  dealershipId?: string | null;
  campaignId?: string | null;
  paymentReference?: string | null;
  reconciliationReference?: string | null;
  reversesEntryId?: string | null;
}

/**
 * Post a balanced entry. Must be called inside a transaction (the deferred
 * balance trigger checks at commit). Returns the existing entry when the
 * idempotency key was already used, with `duplicate: true`.
 */
export async function post(db: DbOrTx, actor: AnyActor, input: PostInput) {
  const existing = await db.query.ledgerEntries.findFirst({ where: eq(ledgerEntries.idempotencyKey, input.idempotencyKey) });
  if (existing) return { entry: existing, duplicate: true as const };
  const legs = input.legs.filter((l) => (l.debit ?? 0) > 0 || (l.credit ?? 0) > 0);
  for (const l of legs) {
    const d = l.debit ?? 0;
    const c = l.credit ?? 0;
    if (!Number.isSafeInteger(d) || !Number.isSafeInteger(c) || d < 0 || c < 0 || (d > 0 && c > 0)) {
      throw new LedgerError("Each ledger line must be a positive whole-paise debit or credit");
    }
  }
  if (legs.length < 2) throw new LedgerError("A ledger entry needs at least two lines");
  const debits = legs.reduce((s, l) => s + (l.debit ?? 0), 0);
  const credits = legs.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (debits !== credits) throw new LedgerError(`Ledger entry does not balance (${debits} vs ${credits})`);

  const [{ seq }] = (await db.execute<{ seq: string }>(sql`SELECT nextval('ledger_transaction_seq') AS seq`)).rows;
  const transactionId = `TXN-${new Date().getUTCFullYear()}-${String(seq).padStart(7, "0")}`;
  const [entry] = await db
    .insert(ledgerEntries)
    .values({
      transactionId,
      type: input.type,
      memo: input.memo.slice(0, 500),
      amount: debits,
      organisationId: input.organisationId ?? null,
      dealershipId: input.dealershipId ?? null,
      campaignId: input.campaignId ?? null,
      paymentReference: input.paymentReference ?? null,
      reconciliationReference: input.reconciliationReference ?? null,
      idempotencyKey: input.idempotencyKey,
      reversesEntryId: input.reversesEntryId ?? null,
      initiatedById: isSystem(actor) ? null : actor.user.id,
      initiatedBySystem: isSystem(actor) ? actor.system : null,
    })
    .returning();
  await db.insert(ledgerLines).values(legs.map((l) => ({ entryId: entry.id, accountId: l.account.id, debit: l.debit ?? 0, credit: l.credit ?? 0 })));
  await audit(db, actor, {
    action: `ledger.${input.type}`,
    entityType: "ledger_entry",
    entityId: entry.id,
    organisationId: input.organisationId ?? null,
    summary: `${transactionId}: ${input.memo}`,
    data: { transactionId, lines: legs.map((l) => ({ account: l.account.code, debit: l.debit ?? 0, credit: l.credit ?? 0 })) },
  });
  return { entry, duplicate: false as const };
}

// ------------------------------------------------------------------ reservations

/**
 * Move `amount` from an organisation's available balance into a campaign
 * platform reservation. Locks the available account first so concurrent
 * reservations are serialised. Returns null if funds are insufficient.
 */
export async function reserve(
  db: DbOrTx,
  actor: AnyActor,
  opts: { organisationId: string; campaignId: string; platformId: string; provider: Provider; amount: number; key: string },
) {
  if (opts.amount <= 0) throw new LedgerError("Reservation amount must be positive");
  const available = await account(db, ACCOUNTS.available(opts.organisationId));
  await lockAccount(db, available);
  const existing = await db.query.ledgerEntries.findFirst({ where: eq(ledgerEntries.idempotencyKey, opts.key) });
  if (existing) return existing;
  const have = await balanceOf(db, available);
  if (have < opts.amount) return null;
  const reserved = await account(db, ACCOUNTS.reserved(opts.organisationId, opts.platformId, opts.provider));
  const { entry } = await post(db, actor, {
    type: "reservation",
    memo: `Reserved ${formatINR(opts.amount)} for ${opts.provider} campaign budget`,
    legs: [
      { account: available, debit: opts.amount },
      { account: reserved, credit: opts.amount },
    ],
    idempotencyKey: opts.key,
    organisationId: opts.organisationId,
    campaignId: opts.campaignId,
  });
  return entry;
}

/** Return any unspent reservation for a campaign platform to the available balance. */
export async function releaseReservation(
  db: DbOrTx,
  actor: AnyActor,
  opts: { organisationId: string; campaignId: string; platformId: string; provider: Provider; key: string; reason: string },
) {
  const reservedCode = ACCOUNTS.reserved(opts.organisationId, opts.platformId, opts.provider).code;
  const reserved = await db.query.ledgerAccounts.findFirst({ where: eq(ledgerAccounts.code, reservedCode) });
  if (!reserved) return null;
  await lockAccount(db, reserved);
  const remaining = await balanceOf(db, reserved);
  if (remaining <= 0) return null;
  const available = await account(db, ACCOUNTS.available(opts.organisationId));
  const { entry } = await post(db, actor, {
    type: "reservation_release",
    memo: `Released ${formatINR(remaining)} unspent ${opts.provider} budget: ${opts.reason}`,
    legs: [
      { account: reserved, debit: remaining },
      { account: available, credit: remaining },
    ],
    idempotencyKey: opts.key,
    organisationId: opts.organisationId,
    campaignId: opts.campaignId,
  });
  return entry;
}

/** Spend already recognised in the ledger for one campaign platform. */
export async function recognisedSpend(db: DbOrTx, platformId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${ledgerLines.debit}), 0)` })
    .from(ledgerLines)
    .innerJoin(ledgerEntries, eq(ledgerEntries.id, ledgerLines.entryId))
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerLines.accountId))
    .where(and(eq(ledgerEntries.type, "media_spend"), eq(ledgerAccounts.campaignPlatformId, platformId)));
  return Number(row.total);
}

/**
 * Recognise newly reported cumulative spend against a reservation, capped at
 * what remains reserved. Spend above the reservation is not posted; the
 * reconciliation run reports it as an exception for a person to resolve.
 */
export async function recogniseMediaSpend(
  db: DbOrTx,
  actor: AnyActor,
  opts: { organisationId: string; campaignId: string; platformId: string; provider: Provider; cumulativeReported: number },
) {
  const reservedCode = ACCOUNTS.reserved(opts.organisationId, opts.platformId, opts.provider).code;
  const reserved = await db.query.ledgerAccounts.findFirst({ where: eq(ledgerAccounts.code, reservedCode) });
  if (!reserved) return null;
  await lockAccount(db, reserved);
  const already = await recognisedSpend(db, opts.platformId);
  const delta = opts.cumulativeReported - already;
  if (delta <= 0) return null;
  const postable = Math.min(delta, await balanceOf(db, reserved));
  if (postable <= 0) return null;
  const payable = await account(db, ACCOUNTS.mediaPayable(opts.provider));
  const { entry } = await post(db, actor, {
    type: "media_spend",
    memo: `Recognised ${formatINR(postable)} ${opts.provider}-reported spend`,
    legs: [
      { account: reserved, debit: postable },
      { account: payable, credit: postable },
    ],
    idempotencyKey: `spend:${opts.platformId}:${already + postable}`,
    organisationId: opts.organisationId,
    campaignId: opts.campaignId,
  });
  return entry;
}

// ------------------------------------------------------------------ reporting

export async function orgBalances(db: DbOrTx, organisationId: string) {
  const accounts = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.organisationId, organisationId));
  let available = 0;
  let reserved = 0;
  let refundPending = 0;
  for (const a of accounts) {
    const b = await balanceOf(db, a);
    if (a.category === "unallocated_balance") available += b;
    else if (a.category === "campaign_budget_reservation") reserved += b;
    else if (a.category === "refunds") refundPending += b;
  }
  const [dep] = await db
    .select({ total: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)` })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.organisationId, organisationId), eq(ledgerEntries.type, "deposit")));
  const [rev] = await db
    .select({ total: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)` })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.organisationId, organisationId), eq(ledgerEntries.type, "deposit_reversal")));
  const spentRows = await db
    .select({ total: sql<string>`coalesce(sum(${ledgerLines.debit}), 0)` })
    .from(ledgerLines)
    .innerJoin(ledgerEntries, eq(ledgerEntries.id, ledgerLines.entryId))
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerLines.accountId))
    .where(and(eq(ledgerEntries.type, "media_spend"), eq(ledgerAccounts.organisationId, organisationId)));
  return {
    totalDeposits: Number(dep.total) - Number(rev.total),
    available,
    reserved,
    refundPending,
    recognisedSpend: Number(spentRows[0].total),
  };
}

export async function orgTransactions(db: DbOrTx, organisationId: string, opts: { from?: Date; to?: Date; limit?: number } = {}) {
  return db
    .select()
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.organisationId, organisationId),
        opts.from ? sql`${ledgerEntries.createdAt} >= ${opts.from.toISOString()}` : undefined,
        opts.to ? sql`${ledgerEntries.createdAt} <= ${opts.to.toISOString()}` : undefined,
      ),
    )
    .orderBy(desc(ledgerEntries.createdAt))
    .limit(opts.limit ?? 500);
}

export async function entryLines(db: DbOrTx, entryIds: string[]) {
  if (!entryIds.length) return [];
  return db
    .select({ entryId: ledgerLines.entryId, code: ledgerAccounts.code, name: ledgerAccounts.name, category: ledgerAccounts.category, debit: ledgerLines.debit, credit: ledgerLines.credit })
    .from(ledgerLines)
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerLines.accountId))
    .where(inArray(ledgerLines.entryId, entryIds));
}

export async function trialBalance(db: DbOrTx) {
  const [row] = await db
    .select({ d: sql<string>`coalesce(sum(${ledgerLines.debit}), 0)`, c: sql<string>`coalesce(sum(${ledgerLines.credit}), 0)` })
    .from(ledgerLines);
  return { debits: Number(row.d), credits: Number(row.c), balanced: Number(row.d) === Number(row.c) };
}

export async function accountBalances(db: DbOrTx) {
  const accounts = await db.select().from(ledgerAccounts);
  const out = [];
  for (const a of accounts) out.push({ ...a, balance: await balanceOf(db, a) });
  return out;
}

export function assertNotDuplicate(result: { duplicate: boolean }, message = "This transaction has already been recorded") {
  if (result.duplicate) throw new ConflictError(message);
}
