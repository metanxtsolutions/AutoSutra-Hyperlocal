/**
 * Publishing approved campaigns and syncing what providers report.
 *
 * - requestPublish queues one job per platform (idempotency key per platform
 *   and approval), so a double click or a retry never queues twice.
 * - executePublish runs in the worker. It re-checks the approval and
 *   configuration hash, claims the platform row, and persists external ids
 *   after every provider call. Retryable provider errors (rate limits,
 *   outages) are retried with backoff by the queue; others mark the platform
 *   failed with the provider's message.
 * - Statuses shown to users come only from adapter results. Demo publications
 *   are stored with mode "demo" and status "demo".
 */
import { and, eq, inArray, max, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "../db/client";
import {
  advertisingConnections,
  campaignPlatforms,
  campaigns,
  creativeAssets,
  metricSnapshots,
  platformStatusEvents,
  providerSpendRecords,
  publicationAttempts,
} from "../db/schema";
import { audit } from "../audit";
import { hasPlatform, requireOrg, type Actor } from "../auth/context";
import { formatINR } from "@/lib/money";
import { todayIST } from "@/lib/format";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { enqueue } from "../jobs/queue";
import { processQueueSoon } from "../jobs/kick";
import { effectiveMode } from "../providers/modes";
import { adapterFor } from "../providers/registry";
import { ProviderError, type PublishSpec, type Refs, type StatusResult } from "../providers/types";
import { getObject } from "../storage";
import { assertPublishable, deriveStatus, loadCampaign, getCampaign, type FullCampaign } from "./campaigns";
import { configSnapshot, hashSnapshot } from "./campaigns/snapshot";
import { releaseCampaignBudget } from "./funding";
import * as ledger from "./ledger";
import { notify } from "./notifications";

const SYSTEM = { system: "publisher" } as const;
type Platform = typeof campaignPlatforms.$inferSelect;

function assertCanOperate(actor: Actor, full: FullCampaign, permission: "campaign.publish" | "campaign.pause") {
  requireOrg(actor, full.campaign.organisationId, permission);
  const member = actor.membership?.organisationId === full.campaign.organisationId;
  if (!member && !full.campaign.managed) throw new ForbiddenError("AutoSutra staff can only operate managed campaigns");
  if (!member && !hasPlatform(actor, "platform.campaign_ops")) throw new ForbiddenError("Campaign operations permission required");
}

// ------------------------------------------------------------------ spec

export function buildSpec(full: FullCampaign, platform: Platform): PublishSpec {
  const c = full.campaign;
  const account = full.platforms.find((p) => p.platform.id === platform.id)?.account ?? null;
  const cr = full.creative!;
  return {
    campaignId: c.id,
    name: c.name,
    objective: c.objective,
    providerCampaignType: platform.providerCampaignType,
    startDate: c.startDate! < todayIST() ? todayIST() : c.startDate!,
    endDate: c.endDate!,
    locations: full.targets.map(({ targeting: t, location: l }) => {
      const b = full.budgets.find((x) => x.campaignPlatformId === platform.id && x.locationId === l.id);
      return {
        locationId: l.id,
        locationName: l.name,
        latitude: l.latitude,
        longitude: l.longitude,
        radiusKm: t.radiusKm,
        includePincodes: t.includePincodes,
        excludePincodes: t.excludePincodes,
        lifetimeBudget: b?.lifetimeBudget ?? 0,
        dailyBudget: b?.dailyBudget ?? null,
      };
    }).filter((l) => l.lifetimeBudget > 0),
    ageMin: c.ageMin,
    ageMax: c.ageMax,
    languages: c.languages,
    placements: c.placements as PublishSpec["placements"],
    keywords: c.keywords,
    creative: {
      headline: cr.headline,
      primaryText: cr.primaryText,
      description: cr.description,
      headlines: cr.headlines,
      descriptions: cr.descriptions,
      callToAction: cr.callToAction,
      landingUrl: cr.landingUrl,
      metaLeadFormId: cr.metaLeadFormId,
      images: full.assets
        .filter((a) => a.kind === "image")
        .map((a: typeof creativeAssets.$inferSelect) => ({ id: a.id, filename: a.filename, bytes: () => getObject(a.storageKey) })),
    },
    account: {
      externalId: account?.externalId ?? "",
      metaPageId: account?.metaPageId ?? null,
      managerCustomerId: account?.managerCustomerId ?? null,
      currency: account?.currency ?? null,
    },
    currency: "INR",
  };
}

// ------------------------------------------------------------------ request

export async function requestPublish(db: Database, actor: Actor, campaignId: string) {
  const full = await getCampaign(db, actor, campaignId, "campaign.view");
  assertCanOperate(actor, full, "campaign.publish");
  const approval = await assertPublishable(db, full);
  const modes = { meta: await effectiveMode(db, "meta"), google: await effectiveMode(db, "google") };
  await db.transaction(async (tx) => {
    const moved = await tx
      .update(campaigns)
      .set({ status: "publishing", updatedAt: new Date() })
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.status, "ready_to_publish"), eq(campaigns.version, full.campaign.version)))
      .returning({ id: campaigns.id });
    if (!moved.length) throw new ConflictError("The campaign is already being published or has changed");
    for (const { platform } of full.platforms) {
      const mode = modes[platform.provider];
      if (mode !== "demo" && mode !== "live") throw new ValidationError(`Publishing to ${platform.provider} is not available (${mode})`);
      await tx.update(campaignPlatforms).set({ status: "queued", mode, lastError: null }).where(eq(campaignPlatforms.id, platform.id));
      await enqueue(tx, "publish_platform", { platformId: platform.id, approvalId: approval.id }, { idempotencyKey: `publish:${platform.id}:${approval.id}`, maxAttempts: 6 });
    }
    await audit(tx, actor, {
      action: "campaign.publish_requested",
      entityType: "campaign",
      entityId: campaignId,
      organisationId: full.campaign.organisationId,
      summary: `Publishing requested for "${full.campaign.name}" (${full.platforms.map((p) => `${p.platform.provider}: ${modes[p.platform.provider]}`).join(", ")})`,
      data: { approvalId: approval.id, configHash: approval.configHash },
    });
  });
  processQueueSoon();
}

/** Re-queue a platform whose publication failed, under the same approval. */
export async function retryPlatform(db: Database, actor: Actor, platformId: string) {
  const platform = await db.query.campaignPlatforms.findFirst({ where: eq(campaignPlatforms.id, platformId) });
  if (!platform) throw new NotFoundError("Not found");
  const full = await getCampaign(db, actor, platform.campaignId, "campaign.view");
  assertCanOperate(actor, full, "campaign.publish");
  if (platform.status !== "failed") throw new ValidationError("Only failed publications can be retried");
  if (!full.campaign.currentApprovalId) throw new ValidationError("The campaign has no current approval");
  const [{ n }] = await db.select({ n: max(publicationAttempts.attemptNo) }).from(publicationAttempts).where(eq(publicationAttempts.campaignPlatformId, platformId));
  await db.transaction(async (tx) => {
    await tx.update(campaignPlatforms).set({ status: "queued", lastError: null }).where(eq(campaignPlatforms.id, platformId));
    await enqueue(tx, "publish_platform", { platformId, approvalId: full.campaign.currentApprovalId }, { idempotencyKey: `publish:${platformId}:${full.campaign.currentApprovalId}:retry:${n ?? 0}`, maxAttempts: 6 });
    await recomputeCampaignStatus(tx, full.campaign.id);
    await audit(tx, actor, { action: "campaign.publish_retry", entityType: "campaign", entityId: full.campaign.id, organisationId: full.campaign.organisationId, summary: `Retry publishing to ${platform.provider}` });
  });
  processQueueSoon();
}

// ------------------------------------------------------------------ execute (worker)

async function recordStatus(db: DbOrTx, platform: Platform, result: StatusResult) {
  const changed = platform.status !== result.status || platform.providerStatusRaw !== result.raw;
  await db
    .update(campaignPlatforms)
    .set({ status: result.status, providerStatusRaw: result.raw, lastSyncedAt: new Date(), lastSyncError: null })
    .where(eq(campaignPlatforms.id, platform.id));
  if (changed) {
    await db.insert(platformStatusEvents).values({ campaignPlatformId: platform.id, status: result.status, providerStatusRaw: result.raw, detail: result.detail ?? null });
    await audit(db, SYSTEM, {
      action: "provider.status_changed",
      entityType: "campaign",
      entityId: platform.campaignId,
      organisationId: platform.organisationId,
      summary: `${platform.provider} (${platform.mode}) reports ${result.raw}`,
      data: { from: platform.status, to: result.status, raw: result.raw, detail: result.detail ?? null },
    });
  }
  return changed;
}

export async function recomputeCampaignStatus(db: DbOrTx, campaignId: string) {
  const c = await db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) });
  if (!c || !["publishing", "active", "partially_published", "paused", "demo_published", "failed", "rejected"].includes(c.status)) return;
  const rows = await db.select({ status: campaignPlatforms.status }).from(campaignPlatforms).where(eq(campaignPlatforms.campaignId, campaignId));
  const next = deriveStatus(rows.map((r) => r.status));
  if (next !== c.status) {
    await db.update(campaigns).set({ status: next, updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
    await audit(db, SYSTEM, { action: "campaign.status_derived", entityType: "campaign", entityId: campaignId, organisationId: c.organisationId, summary: `Campaign status ${c.status} → ${next}` });
  }
}

async function markConnectionProblem(db: DbOrTx, organisationId: string, provider: "meta" | "google", e: ProviderError) {
  if (e.kind !== "auth" && e.kind !== "permission") return;
  await db
    .update(advertisingConnections)
    .set({ status: e.kind === "auth" ? "expired" : "error", lastError: e.message.slice(0, 1000), lastCheckedAt: new Date() })
    .where(and(eq(advertisingConnections.organisationId, organisationId), eq(advertisingConnections.provider, provider)));
  await notify(db, {
    organisationId,
    kind: "connection_problem",
    severity: "critical",
    title: `${provider === "meta" ? "Meta" : "Google Ads"} connection needs attention`,
    body: e.message,
    link: "/app/settings/connections",
    dedupeKey: `connection_problem:${organisationId}:${provider}:${todayIST()}`,
  });
}

export async function executePublish(db: Database, platformId: string, approvalId: string, attemptsSoFar: number, maxAttempts: number) {
  const platform = await db.query.campaignPlatforms.findFirst({ where: eq(campaignPlatforms.id, platformId) });
  if (!platform) return;
  if (platform.publishedAt) return; // already published; duplicate job is a no-op
  const full = await loadCampaign(db, platform.campaignId);
  if (!full) return;
  const c = full.campaign;

  const failPermanently = async (message: string) => {
    await db.transaction(async (tx) => {
      await tx.update(campaignPlatforms).set({ status: "failed", lastError: message }).where(eq(campaignPlatforms.id, platformId));
      await tx.insert(platformStatusEvents).values({ campaignPlatformId: platformId, status: "failed", providerStatusRaw: "PUBLISH_FAILED", detail: message });
      await recomputeCampaignStatus(tx, c.id);
      await audit(tx, SYSTEM, { action: "provider.publish_failed", entityType: "campaign", entityId: c.id, organisationId: c.organisationId, summary: `${platform.provider} publish failed: ${message}` });
      await notify(tx, {
        organisationId: c.organisationId,
        kind: "publish_failed",
        severity: "critical",
        title: `"${c.name}" failed to publish on ${platform.provider === "meta" ? "Meta" : "Google Ads"}`,
        body: message,
        link: `/app/campaigns/${c.id}`,
        dedupeKey: `publish_failed:${platformId}:${attemptsSoFar}`,
      });
      await notify(tx, {
        organisationId: null,
        audience: "platform",
        kind: "publish_failed",
        severity: "critical",
        title: `Publish failed: ${c.name}`,
        body: `${full.organisation.name}, ${platform.provider}: ${message}`,
        link: `/admin/campaigns/${c.id}`,
        dedupeKey: `ops_publish_failed:${platformId}:${attemptsSoFar}`,
      });
    });
  };

  // The approval must still be current and the configuration unchanged.
  if (c.currentApprovalId !== approvalId || !["publishing", "partially_published", "failed", "active", "paused", "demo_published", "rejected"].includes(c.status)) {
    await failPermanently("The campaign changed or was cancelled after publishing was requested.");
    return;
  }
  const approval = full.approvals.find((a) => a.id === approvalId);
  if (!approval || approval.configHash !== hashSnapshot(configSnapshot(full))) {
    await failPermanently("The configuration no longer matches the approval. Re-approve before publishing.");
    return;
  }

  // Claim the platform so concurrent workers cannot publish it twice.
  const claimed = await db
    .update(campaignPlatforms)
    .set({ status: "publishing" })
    .where(and(eq(campaignPlatforms.id, platformId), inArray(campaignPlatforms.status, ["queued", "publishing"]), sql`${campaignPlatforms.publishedAt} IS NULL`))
    .returning();
  if (!claimed.length) return;
  const mode = platform.mode ?? "demo";
  const [{ n }] = await db.select({ n: max(publicationAttempts.attemptNo) }).from(publicationAttempts).where(eq(publicationAttempts.campaignPlatformId, platformId));
  const refs: Refs = { ...(platform.externalRefs ?? {}) };
  const [attempt] = await db
    .insert(publicationAttempts)
    .values({ campaignPlatformId: platformId, approvalId, attemptNo: (n ?? 0) + 1, mode, status: "running", refsBefore: { ...refs } })
    .returning();
  const persistRefs = async (r: Refs) => {
    await db.update(campaignPlatforms).set({ externalRefs: { ...r } }).where(eq(campaignPlatforms.id, platformId));
  };

  try {
    const adapter = await adapterFor(db, c.organisationId, platform.provider, mode);
    const result = await adapter.publish(buildSpec(full, platform), refs, { persistRefs });
    await db.transaction(async (tx) => {
      await tx.update(campaignPlatforms).set({ externalRefs: refs, publishedAt: new Date(), lastError: null }).where(eq(campaignPlatforms.id, platformId));
      await tx.update(publicationAttempts).set({ status: "succeeded", refsAfter: refs, providerStatus: result.raw, finishedAt: new Date() }).where(eq(publicationAttempts.id, attempt.id));
      await recordStatus(tx, { ...platform, status: "publishing" }, result);
      await recomputeCampaignStatus(tx, c.id);
      await audit(tx, SYSTEM, {
        action: "provider.published",
        entityType: "campaign",
        entityId: c.id,
        organisationId: c.organisationId,
        summary: `${mode === "demo" ? "Demo publication recorded (nothing sent to provider)" : `Published to ${platform.provider}`}: ${result.raw}`,
        data: { refs, mode },
      });
    });
  } catch (e) {
    const pe = e instanceof ProviderError ? e : new ProviderError(e instanceof Error ? e.message : String(e), "unknown");
    await db
      .update(publicationAttempts)
      .set({ status: "failed", refsAfter: refs, error: pe.message.slice(0, 2000), retryable: pe.retryable, finishedAt: new Date() })
      .where(eq(publicationAttempts.id, attempt.id));
    await markConnectionProblem(db, c.organisationId, platform.provider, pe);
    if (pe.retryable && attemptsSoFar < maxAttempts) {
      await db.update(campaignPlatforms).set({ status: "queued", lastError: `Retrying: ${pe.message}` }).where(eq(campaignPlatforms.id, platformId));
      throw pe; // the queue retries with backoff
    }
    await failPermanently(pe.message);
  }
}

// ------------------------------------------------------------------ sync

export async function syncPlatform(db: Database, platformId: string) {
  const platform = await db.query.campaignPlatforms.findFirst({ where: eq(campaignPlatforms.id, platformId) });
  if (!platform?.publishedAt || platform.mode !== "live") return { skipped: true };
  const full = await loadCampaign(db, platform.campaignId);
  if (!full) return { skipped: true };
  const c = full.campaign;
  try {
    const adapter = await adapterFor(db, c.organisationId, platform.provider, "live");
    const status = await adapter.fetchStatus(platform.externalRefs);
    const until = [todayIST(), c.endDate!].sort()[0];
    const since = c.startDate! <= until ? c.startDate! : until;
    const metrics = await adapter.fetchMetrics(platform.externalRefs, since, until);
    const cumulative = metrics.rows.reduce((s, r) => s + (r.spend ?? 0), 0);
    await db.transaction(async (tx) => {
      await recordStatus(tx, platform, status);
      for (const r of metrics.rows) {
        await tx
          .insert(metricSnapshots)
          .values({ campaignPlatformId: platform.id, organisationId: c.organisationId, provider: platform.provider, metricDate: r.date, impressions: r.impressions, reach: r.reach, clicks: r.clicks, spend: r.spend, platformConversions: r.conversions, attributionNote: metrics.attributionNote })
          .onConflictDoUpdate({
            target: [metricSnapshots.campaignPlatformId, metricSnapshots.metricDate],
            set: { impressions: r.impressions, reach: r.reach, clicks: r.clicks, spend: r.spend, platformConversions: r.conversions, attributionNote: metrics.attributionNote, capturedAt: new Date() },
          });
      }
      if (cumulative !== platform.reportedSpend) {
        await tx.insert(providerSpendRecords).values({ organisationId: c.organisationId, campaignPlatformId: platform.id, provider: platform.provider, cumulativeSpend: cumulative, currency: "INR", mode: "live" });
        await tx.update(campaignPlatforms).set({ reportedSpend: cumulative }).where(eq(campaignPlatforms.id, platform.id));
      }
      // Central wallet only: recognise reported spend against the reservation (capped; overspend goes to reconciliation).
      await ledger.recogniseMediaSpend(tx, { system: "spend-sync" }, { organisationId: c.organisationId, campaignId: c.id, platformId: platform.id, provider: platform.provider, cumulativeReported: cumulative });
      await recomputeCampaignStatus(tx, c.id);
    });
    await spendSafetyChecks(db, platform.campaignId);
    return { skipped: false, status: status.status, cumulative };
  } catch (e) {
    const pe = e instanceof ProviderError ? e : new ProviderError(e instanceof Error ? e.message : String(e), "unknown");
    await db.update(campaignPlatforms).set({ lastSyncError: pe.message.slice(0, 1000) }).where(eq(campaignPlatforms.id, platformId));
    await markConnectionProblem(db, c.organisationId, platform.provider, pe);
    if (pe.retryable) throw pe;
    return { skipped: false, error: pe.message };
  }
}

/**
 * Threshold alerts and the authorised-spend safety stop. Provider reporting
 * lags delivery, so spend can briefly exceed a threshold before these run.
 */
export async function spendSafetyChecks(db: Database, campaignId: string) {
  const full = await loadCampaign(db, campaignId);
  if (!full) return;
  const c = full.campaign;
  const approval = full.approvals.find((a) => a.id === c.currentApprovalId);
  const budget = approval?.approvedBudget ?? 0;
  const reported = full.platforms.reduce((s, p) => s + p.platform.reportedSpend, 0);
  if (!budget || !reported) return;
  if (reported >= (budget * c.alertThresholdPct) / 100) {
    await notify(db, {
      organisationId: c.organisationId,
      kind: "spend_threshold",
      severity: "warning",
      title: `"${c.name}" reached ${c.alertThresholdPct}% of its budget`,
      body: `Reported spend ${formatINR(reported)} of approved ${formatINR(budget)}.`,
      link: `/app/campaigns/${c.id}`,
      dedupeKey: `spend_threshold:${c.id}:${c.currentApprovalId}:${c.alertThresholdPct}`,
    });
  }
  const cap = approval?.maxAuthorisedSpend ?? c.maxAuthorisedSpend;
  if (cap && reported >= cap) {
    for (const { platform } of full.platforms.filter((p) => p.platform.mode === "live" && p.platform.status === "active")) {
      try {
        const adapter = await adapterFor(db, c.organisationId, platform.provider, "live");
        const result = await adapter.setPaused(platform.externalRefs, true);
        await db.transaction(async (tx) => {
          await recordStatus(tx, platform, result);
          await audit(tx, { system: "spend-guard" }, { action: "provider.auto_paused", entityType: "campaign", entityId: c.id, organisationId: c.organisationId, summary: `Paused ${platform.provider}: reported spend ${formatINR(reported)} reached the authorised maximum ${formatINR(cap)}` });
        });
      } catch (e) {
        console.error(JSON.stringify({ level: "error", msg: "auto_pause_failed", campaignId: c.id, error: e instanceof Error ? e.message : String(e) }));
      }
    }
    await recomputeCampaignStatus(db, c.id);
    await notify(db, {
      organisationId: c.organisationId,
      kind: "spend_cap_reached",
      severity: "critical",
      title: `"${c.name}" reached its maximum authorised spend`,
      body: `Reported spend ${formatINR(reported)} reached the authorised ${formatINR(cap)}. AutoSutra paused active platforms. Provider reporting can lag, so final spend may be slightly higher.`,
      link: `/app/campaigns/${c.id}`,
      dedupeKey: `spend_cap:${c.id}:${c.currentApprovalId}`,
    });
  }
}

/** Queue a sync for every live published platform (scheduled by cron). */
export async function scheduleSyncAll(db: DbOrTx) {
  const rows = await db
    .select({ id: campaignPlatforms.id })
    .from(campaignPlatforms)
    .innerJoin(campaigns, eq(campaigns.id, campaignPlatforms.campaignId))
    .where(and(eq(campaignPlatforms.mode, "live"), sql`${campaignPlatforms.publishedAt} IS NOT NULL`, inArray(campaigns.status, ["publishing", "active", "partially_published", "paused"])));
  const slot = Math.floor(Date.now() / (15 * 60_000));
  for (const r of rows) await enqueue(db, "sync_platform", { platformId: r.id }, { idempotencyKey: `sync:${r.id}:${slot}`, maxAttempts: 3 });
  return rows.length;
}

// ------------------------------------------------------------------ pause / resume / close

export async function setPlatformPaused(db: Database, actor: Actor, platformId: string, paused: boolean) {
  const platform = await db.query.campaignPlatforms.findFirst({ where: eq(campaignPlatforms.id, platformId) });
  if (!platform) throw new NotFoundError("Not found");
  const full = await getCampaign(db, actor, platform.campaignId, "campaign.view");
  assertCanOperate(actor, full, "campaign.pause");
  if (!platform.publishedAt || !platform.mode) throw new ValidationError("This platform has not been published");
  if (!paused && full.campaign.endDate && full.campaign.endDate < todayIST()) throw new ValidationError("The campaign has ended and cannot be resumed");
  const adapter = await adapterFor(db, full.campaign.organisationId, platform.provider, platform.mode);
  let result: StatusResult;
  const refs = { ...platform.externalRefs };
  try {
    result = await adapter.setPaused(refs, paused);
  } catch (e) {
    if (e instanceof ProviderError) {
      await markConnectionProblem(db, full.campaign.organisationId, platform.provider, e);
      throw new ValidationError(e.message);
    }
    throw e;
  }
  await db.transaction(async (tx) => {
    await tx.update(campaignPlatforms).set({ externalRefs: refs }).where(eq(campaignPlatforms.id, platformId));
    await recordStatus(tx, platform, result);
    await recomputeCampaignStatus(tx, full.campaign.id);
    await audit(tx, actor, {
      action: paused ? "provider.paused" : "provider.resumed",
      entityType: "campaign",
      entityId: full.campaign.id,
      organisationId: full.campaign.organisationId,
      summary: `${paused ? "Paused" : "Resumed"} ${platform.provider}${platform.mode === "demo" ? " (demo)" : ""}: provider reports ${result.raw}`,
    });
  });
}

/** Finish a campaign: no platform may still be running; unspent reservations are released. */
export async function closeCampaign(db: Database, actor: Actor, campaignId: string) {
  const full = await getCampaign(db, actor, campaignId, "campaign.view");
  assertCanOperate(actor, full, "campaign.pause");
  const running = full.platforms.filter((p) => ["active", "pending_review", "queued", "publishing"].includes(p.platform.status));
  if (running.length) throw new ValidationError(`Pause ${running.map((p) => p.platform.provider).join(" and ")} before completing the campaign`);
  if (!["active", "partially_published", "paused", "failed", "rejected", "demo_published"].includes(full.campaign.status)) throw new ValidationError("Only published campaigns can be completed");
  await db.transaction(async (tx) => {
    await releaseCampaignBudget(tx, actor, full.campaign, "campaign completed");
    await tx.update(campaigns).set({ status: "completed", updatedAt: new Date() }).where(eq(campaigns.id, campaignId));
    await audit(tx, actor, { action: "campaign.completed", entityType: "campaign", entityId: campaignId, organisationId: full.campaign.organisationId, summary: `Completed "${full.campaign.name}"` });
    await notify(tx, { organisationId: full.campaign.organisationId, kind: "campaign_ended", title: `"${full.campaign.name}" completed`, body: "Final results remain available in reports.", link: `/app/campaigns/${campaignId}`, dedupeKey: `campaign_ended:${campaignId}` });
  });
}

