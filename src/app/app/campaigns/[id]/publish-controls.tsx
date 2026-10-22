import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Alert } from "@/components/ui/card";
import { can, hasPlatform, type Actor } from "@/server/auth/context";
import type { FullCampaign } from "@/server/services/campaigns";
import { completeAction, pauseAction, publishAction, retryPlatformAction, syncNowAction } from "../actions";

export function PublishControls({ full, actor }: { full: FullCampaign; actor: Actor }) {
  const c = full.campaign;
  const org = c.organisationId;
  const member = actor.membership?.organisationId === org;
  const staffOk = c.managed && hasPlatform(actor, "platform.campaign_ops");
  const canPublish = (member && can(actor, org, "campaign.publish")) || staffOk;
  const canPause = (member && can(actor, org, "campaign.pause")) || staffOk;
  const live = full.platforms.some((p) => p.platform.mode === "live" && p.platform.publishedAt);
  return (
    <div className="mt-4 space-y-3 border-t border-ink-100 pt-4">
      {c.status === "ready_to_publish" && canPublish && (
        <ActionForm action={publishAction.bind(null, c.id)}>
          <p className="text-sm text-ink-600">The campaign is approved. Publishing sends it to each platform; status updates as the providers respond.</p>
          <SubmitButton>Publish now</SubmitButton>
        </ActionForm>
      )}
      {c.status === "ready_to_publish" && !canPublish && <Alert tone="info">Approved and waiting for someone with publishing rights.</Alert>}
      {canPause && (
        <div className="flex flex-wrap gap-2">
          {full.platforms.map(({ platform: p }) => (
            <div key={p.id} className="flex gap-2">
              {p.publishedAt && p.status === "active" && (
                <ActionForm action={pauseAction.bind(null, p.id, true)}><SubmitButton size="sm" variant="secondary">Pause {p.provider === "meta" ? "Meta" : "Google"}</SubmitButton></ActionForm>
              )}
              {p.publishedAt && p.status === "paused" && (
                <ActionForm action={pauseAction.bind(null, p.id, false)}><SubmitButton size="sm" variant="secondary">Resume {p.provider === "meta" ? "Meta" : "Google"}</SubmitButton></ActionForm>
              )}
              {p.status === "failed" && !p.publishedAt && canPublish && (
                <ActionForm action={retryPlatformAction.bind(null, p.id)}><SubmitButton size="sm" variant="secondary">Retry {p.provider === "meta" ? "Meta" : "Google"}</SubmitButton></ActionForm>
              )}
            </div>
          ))}
          {live && <ActionForm action={syncNowAction.bind(null, c.id)}><SubmitButton size="sm" variant="ghost">Sync now</SubmitButton></ActionForm>}
          {["active", "partially_published", "paused", "failed", "rejected", "demo_published"].includes(c.status) && (
            <ActionForm action={completeAction.bind(null, c.id)}><SubmitButton size="sm" variant="ghost">Mark completed</SubmitButton></ActionForm>
          )}
        </div>
      )}
      {c.managed && member && <p className="text-xs text-ink-500">AutoSutra operations launch managed campaigns after your approval. They cannot change the approved budget or configuration.</p>}
    </div>
  );
}
