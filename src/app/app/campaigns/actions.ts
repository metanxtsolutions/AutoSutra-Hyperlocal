"use server";

import { redirect } from "next/navigation";
import { checkbox, formObject, runAction, type ActionState } from "@/server/actions";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import * as campaigns from "@/server/services/campaigns";
import * as publishing from "@/server/services/publishing";
import { enqueue } from "@/server/jobs/queue";
import { processQueueSoon } from "@/server/jobs/kick";

export async function createCampaignAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await runAction(fd, async () => {
    const actor = await requireOrgActor();
    const [dealershipId, primaryLocationId] = String(fd.get("location") ?? ":").split(":");
    const c = await campaigns.createDraft(getDb(), actor, actor.membership.organisationId, { ...formObject(fd), dealershipId, primaryLocationId });
    id = c.id;
  });
  if (r.ok) redirect(`/app/campaigns/${id}/edit?step=product`);
  return r;
}

function next(id: string, step: string) {
  return `/app/campaigns/${id}/edit?step=${step}&notice=Saved`;
}

export async function productAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(fd, async () => {
    await campaigns.updateProduct(getDb(), await requireOrgActor(), id, { ...formObject(fd), priceVerified: checkbox(fd, "priceVerified"), financeApproved: checkbox(fd, "financeApproved") });
  });
  if (r.ok) redirect(next(id, "platforms"));
  return r;
}

export async function platformsAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(fd, async () => {
    await campaigns.setPlatforms(getDb(), await requireOrgActor(), id, formObject(fd, ["providers"]));
  });
  if (r.ok) redirect(next(id, "targeting"));
  return r;
}

export async function targetingAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(fd, async () => {
    const ids = fd.getAll("locationIds").map(String);
    const targets = ids.map((locationId) => ({
      locationId,
      radiusKm: fd.get(`radius_${locationId}`),
      includePincodes: String(fd.get(`include_${locationId}`) ?? ""),
      excludePincodes: String(fd.get(`exclude_${locationId}`) ?? ""),
    }));
    await campaigns.updateTargeting(getDb(), await requireOrgActor(), id, { ...formObject(fd, ["languages"]), targets });
  });
  if (r.ok) redirect(next(id, "budget"));
  return r;
}

export async function budgetAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(fd, async () => {
    const allocations: Record<string, { lifetime: string; daily: string }> = {};
    for (const [k, v] of fd.entries()) {
      const m = /^alloc_(lifetime|daily)_(.+)$/.exec(k);
      if (!m || typeof v !== "string") continue;
      allocations[m[2]] ??= { lifetime: "", daily: "" };
      allocations[m[2]][m[1] as "lifetime" | "daily"] = v;
    }
    await campaigns.updateBudget(getDb(), await requireOrgActor(), id, { ...formObject(fd), allocations });
  });
  if (r.ok) redirect(next(id, "creative"));
  return r;
}

export async function creativeAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(fd, async () => {
    await campaigns.updateCreative(getDb(), await requireOrgActor(), id, formObject(fd, ["assetIds"]));
  });
  if (r.ok) redirect(`/app/campaigns/${id}?notice=${encodeURIComponent("Creative saved. Check readiness and submit for approval.")}`);
  return r;
}

export async function uploadAssetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await requireOrgActor();
    const file = fd.get("file");
    if (!(file instanceof File)) throw new Error("No file");
    await campaigns.uploadAsset(getDb(), actor, actor.membership.organisationId, file, { confirmed: checkbox(fd, "licenceConfirmed"), note: String(fd.get("licenceNote") ?? "") });
    return "Uploaded. Select it below to use it in this campaign.";
  });
}

export async function submitAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(fd, async () => {
    await campaigns.submitForApproval(getDb(), await requireOrgActor(), id);
  });
  if (r.ok) redirect(`/app/campaigns/${id}?notice=${encodeURIComponent("Submitted for approval")}`);
  return r;
}

export async function approveAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(fd, async () => {
    await campaigns.approve(getDb(), await requireOrgActor(), id, {
      confirmBudget: checkbox(fd, "confirmBudget"),
      confirmClaims: checkbox(fd, "confirmClaims"),
      note: String(fd.get("note") ?? ""),
      expectedHash: String(fd.get("expectedHash") ?? ""),
    });
  });
  if (r.ok) redirect(`/app/campaigns/${id}?notice=${encodeURIComponent("Campaign approved")}`);
  return r;
}

export async function requestChangesAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(fd, async () => {
    await campaigns.requestChanges(getDb(), await requireOrgActor(), id, formObject(fd));
  });
  if (r.ok) redirect(`/app/campaigns/${id}?notice=${encodeURIComponent("Changes requested")}`);
  return r;
}

export async function cancelAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(fd, async () => {
    await campaigns.cancel(getDb(), await requireOrgActor(), id, formObject(fd));
  });
  if (r.ok) redirect(`/app/campaigns/${id}?notice=Cancelled`);
  return r;
}

export async function archiveAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(fd, async () => {
    await campaigns.archive(getDb(), await requireOrgActor(), id);
  });
  if (r.ok) redirect(`/app/campaigns/${id}?notice=Archived`);
  return r;
}

export async function retryFundingAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await campaigns.retryFunding(getDb(), await requireOrgActor(), id);
    return "Funds reserved. The campaign is ready to publish.";
  });
}

// ------------------------------------------------------------------ publishing (Phase 3)


export async function publishAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await publishing.requestPublish(getDb(), await requireOrgActor(), id);
    return "Publishing has started. Each platform's status updates as the provider responds.";
  });
}

export async function pauseAction(platformId: string, paused: boolean, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await publishing.setPlatformPaused(getDb(), await requireOrgActor(), platformId, paused);
    return paused ? "Pause sent. Status shows what the provider reports." : "Resume sent. Status shows what the provider reports.";
  });
}

export async function retryPlatformAction(platformId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await publishing.retryPlatform(getDb(), await requireOrgActor(), platformId);
    return "Retry queued";
  });
}

export async function syncNowAction(campaignId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    const actor = await requireOrgActor();
    const db = getDb();
    const full = await campaigns.getCampaign(db, actor, campaignId);
    const slot = Math.floor(Date.now() / 60_000);
    for (const { platform } of full.platforms.filter((p) => p.platform.mode === "live" && p.platform.publishedAt)) {
      await enqueue(db, "sync_platform", { platformId: platform.id }, { idempotencyKey: `sync:${platform.id}:manual:${slot}`, maxAttempts: 3 });
    }
    processQueueSoon();
    return "Sync queued. Results appear when the provider responds.";
  });
}

export async function completeAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(fd, async () => {
    await publishing.closeCampaign(getDb(), await requireOrgActor(), id);
    return "Campaign completed";
  });
}
