/**
 * Funding models.
 *
 * dealer_funded (default)
 *   The customer's own Meta and Google ad accounts are billed by the platforms.
 *   AutoSutra records planned and approved budgets and provider-reported spend,
 *   but holds no advertising money and posts nothing to the client-funds ledger.
 *
 * central_wallet (behind the `central_wallet` feature flag)
 *   Customers deposit advertising budgets with AutoSutra; approval reserves
 *   funds per campaign platform in the ledger. Enable only after the legal,
 *   payment-provider and ad-platform review described in docs/FUNDING_MODEL.md.
 *
 * Switching models does not change campaign management; only the funding step
 * of the approval workflow changes.
 */
import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { budgetReservations, campaignBudgets, campaignPlatforms } from "../db/schema";
import type { AnyActor } from "../auth/context";
import { isEnabled } from "../flags";
import * as ledger from "./ledger";

export type FundingMode = "dealer_funded" | "central_wallet";

export async function fundingMode(db: DbOrTx): Promise<FundingMode> {
  return (await isEnabled(db, "central_wallet")) ? "central_wallet" : "dealer_funded";
}

export interface FundingResult {
  mode: FundingMode;
  status: "not_required" | "reserved" | "insufficient";
  required: number;
  available: number;
}

/** Reserve the approved budget for every platform of a campaign, all or nothing. */
export async function reserveCampaignBudget(
  db: DbOrTx,
  actor: AnyActor,
  campaign: { id: string; organisationId: string },
  approvalId: string,
): Promise<FundingResult> {
  const mode = await fundingMode(db);
  const platforms = await db.select().from(campaignPlatforms).where(eq(campaignPlatforms.campaignId, campaign.id));
  const budgets = await db.select().from(campaignBudgets).where(eq(campaignBudgets.campaignId, campaign.id));
  const required = budgets.reduce((s, b) => s + b.lifetimeBudget, 0);
  if (mode === "dealer_funded") return { mode, status: "not_required", required, available: 0 };

  const availableAcct = await ledger.account(db, ledger.ACCOUNTS.available(campaign.organisationId));
  await ledger.lockAccount(db, availableAcct);
  const available = await ledger.balanceOf(db, availableAcct);
  if (available < required) return { mode, status: "insufficient", required, available };

  for (const p of platforms) {
    const amount = budgets.filter((b) => b.campaignPlatformId === p.id).reduce((s, b) => s + b.lifetimeBudget, 0);
    if (amount <= 0) continue;
    const entry = await ledger.reserve(db, actor, {
      organisationId: campaign.organisationId,
      campaignId: campaign.id,
      platformId: p.id,
      provider: p.provider,
      amount,
      key: `reserve:${p.id}:${approvalId}`,
    });
    if (!entry) return { mode, status: "insufficient", required, available };
    await db
      .insert(budgetReservations)
      .values({
        organisationId: campaign.organisationId,
        campaignId: campaign.id,
        campaignPlatformId: p.id,
        approvalId,
        amount,
        reserveEntryId: entry.id,
      })
      .onConflictDoNothing();
  }
  return { mode, status: "reserved", required, available };
}

/** Release all active reservations for a campaign (unspent amounts only). */
export async function releaseCampaignBudget(db: DbOrTx, actor: AnyActor, campaign: { id: string; organisationId: string }, reason: string) {
  const active = await db
    .select({ r: budgetReservations, provider: campaignPlatforms.provider })
    .from(budgetReservations)
    .innerJoin(campaignPlatforms, eq(campaignPlatforms.id, budgetReservations.campaignPlatformId))
    .where(and(eq(budgetReservations.campaignId, campaign.id), eq(budgetReservations.status, "active")));
  for (const { r, provider } of active) {
    const entry = await ledger.releaseReservation(db, actor, {
      organisationId: campaign.organisationId,
      campaignId: campaign.id,
      platformId: r.campaignPlatformId,
      provider,
      key: `release:${r.id}`,
      reason,
    });
    await db
      .update(budgetReservations)
      .set({ status: entry ? "released" : "exhausted", releaseEntryId: entry?.id ?? null, releasedAt: new Date() })
      .where(eq(budgetReservations.id, r.id));
  }
}
