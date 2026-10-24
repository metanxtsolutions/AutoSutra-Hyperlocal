import type { Metadata } from "next";
import { and, desc, eq, inArray } from "drizzle-orm";
import { BadgeCheck, CalendarRange, Pencil, PiggyBank, Wallet } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { ButtonLink } from "@/components/ui/button";
import { Alert, Card, CardHeader, DescriptionList, PageHeader, Stat } from "@/components/ui/card";
import { Badge, StatusBadge, humanize } from "@/components/ui/badge";
import { TextAreaField } from "@/components/ui/fields";
import { Modal } from "@/components/ui/modal";
import { formatINR } from "@/lib/money";
import { formatDate, formatDateTime, relativeAge } from "@/lib/format";
import { objectiveDef } from "@/lib/objectives";
import { can } from "@/server/auth/context";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { auditLogs, publicationAttempts, users } from "@/server/db/schema";
import { EDITABLE_STATUSES, checkReadiness, getCampaign, platformBudget, totalBudget } from "@/server/services/campaigns";
import { archiveAction, cancelAction, retryFundingAction } from "../actions";
import { PublishControls } from "./publish-controls";
import { ReadinessList } from "./readiness-list";

export const metadata: Metadata = { title: "Campaign" };

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireOrgActor();
  const db = getDb();
  const full = await getCampaign(db, actor, id);
  const c = full.campaign;
  const orgId = c.organisationId;
  const editable = (EDITABLE_STATUSES as readonly string[]).includes(c.status);
  const readiness = editable ? await checkReadiness(db, full) : null;
  const platformIds = full.platforms.map((p) => p.platform.id);
  const [attempts, history, approvers] = await Promise.all([
    Promise.all(platformIds.map((pid) => db.select().from(publicationAttempts).where(eq(publicationAttempts.campaignPlatformId, pid)).orderBy(desc(publicationAttempts.startedAt)).limit(5))),
    db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "campaign"), eq(auditLogs.entityId, c.id))).orderBy(desc(auditLogs.createdAt)).limit(40),
    full.approvals.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, full.approvals.map((a) => a.decidedById))) : Promise.resolve([]),
  ]);
  const nameOf = (uid: string) => approvers.find((u) => u.id === uid)?.name ?? "Unknown";
  const total = totalBudget(full);
  const reported = full.platforms.reduce((s, p) => s + p.platform.reportedSpend, 0);
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Campaigns", href: "/app/campaigns" }, { label: c.name }]}
        title={c.name}
        description={`${objectiveDef(c.objective)?.label} · ${full.dealership.name}: ${full.primaryLocation.name}`}
        actions={
          <>
            <StatusBadge status={c.status} />
            {c.managed && <Badge tone="brand">Managed by AutoSutra</Badge>}
            {editable && can(actor, orgId, "campaign.edit") && <ButtonLink href={`/app/campaigns/${c.id}/edit`} variant="secondary"><Pencil />Edit</ButtonLink>}
            <ButtonLink href={`/app/campaigns/${c.id}/review`} variant={c.status === "pending_approval" ? "primary" : "secondary"}>{c.status === "pending_approval" ? "Review and approve" : "Review"}</ButtonLink>
          </>
        }
      />
      {c.status === "changes_requested" && (
        <div className="mb-4"><Alert tone="warn" title="Changes requested">{full.approvals.find((a) => a.decision === "changes_requested")?.note}</Alert></div>
      )}
      {c.status === "pending_funding" && (
        <div className="mb-4">
          <Alert tone="warn" title="Approved, waiting for funds">
            Add funds to your advertising wallet, then reserve the budget.
            <ActionForm action={retryFundingAction.bind(null, c.id)} className="mt-2"><SubmitButton size="sm" variant="secondary">Reserve budget now</SubmitButton></ActionForm>
          </Alert>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Planned budget" icon={<CalendarRange />} value={formatINR(total, { decimals: false })} />
        <Stat label="Approved budget" icon={<BadgeCheck />} value={formatINR(full.approvals.find((a) => a.id === c.currentApprovalId)?.approvedBudget ?? null, { decimals: false })} hint={c.currentApprovalId ? "Customer approval on record" : "Not approved yet"} />
        <Stat label="Provider-reported spend" icon={<Wallet />} value={formatINR(reported, { decimals: false })} hint={full.platforms.some((p) => p.platform.mode === "demo") ? "Demo publications report no spend" : "As last synced"} />
        <Stat label="Remaining approved" icon={<PiggyBank />} value={c.currentApprovalId ? formatINR(Math.max(0, (full.approvals.find((a) => a.id === c.currentApprovalId)?.approvedBudget ?? 0) - reported), { decimals: false }) : "–"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Platforms" description="Status is shown exactly as each provider reports it." />
            {full.platforms.length === 0 ? (
              <p className="text-sm text-ink-500">No platforms selected yet.</p>
            ) : (
              <div className="space-y-4">
                {full.platforms.map(({ platform: p, account }, i) => (
                  <div key={p.id} className="rounded-lg border border-ink-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold">{p.provider === "meta" ? "Meta Ads" : "Google Ads"} <span className="font-normal text-ink-500">· {p.providerCampaignType}</span></div>
                      <div className="flex gap-2">
                        {p.mode && <Badge tone={p.mode === "live" ? "ok" : "demo"}>{p.mode === "live" ? "Live" : "Demo"}</Badge>}
                        <StatusBadge status={p.status} />
                      </div>
                    </div>
                    <dl className="mt-2 grid gap-2 text-xs text-ink-600 sm:grid-cols-4">
                      <div><dt className="font-medium">Budget</dt><dd className="tabular-nums">{formatINR(platformBudget(full, p.id))}</dd></div>
                      <div><dt className="font-medium">Reported spend</dt><dd className="tabular-nums">{p.mode === "live" ? formatINR(p.reportedSpend) : "–"}</dd></div>
                      <div><dt className="font-medium">Provider status</dt><dd>{p.providerStatusRaw ?? "–"}</dd></div>
                      <div><dt className="font-medium">Last synced</dt><dd>{relativeAge(p.lastSyncedAt)}</dd></div>
                    </dl>
                    {account && <p className="mt-2 text-xs text-ink-500">Account: {account.name} ({account.externalId})</p>}
                    {Object.keys(p.externalRefs).length > 0 && <p className="mt-1 break-all text-[11px] text-ink-400">Provider ids: {Object.entries(p.externalRefs).map(([k, v]) => `${k}=${v}`).join(", ")}</p>}
                    {p.lastError && <div className="mt-2"><Alert tone="bad">{p.lastError}</Alert></div>}
                    {p.lastSyncError && <div className="mt-2"><Alert tone="warn" title="Last sync failed">{p.lastSyncError}</Alert></div>}
                    {attempts[i]?.length > 0 && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-ink-500">Publication attempts ({attempts[i].length})</summary>
                        <ul className="mt-1 space-y-1">
                          {attempts[i].map((a) => (
                            <li key={a.id}>#{a.attemptNo} {formatDateTime(a.startedAt)}: {a.status}{a.providerStatus ? ` (${a.providerStatus})` : ""}{a.error ? `: ${a.error}` : ""}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
            <PublishControls full={full} actor={actor} />
          </Card>
          {readiness && (
            <Card>
              <CardHeader title="Readiness" description="Fix blockers before submitting for approval." actions={readiness.ready && can(actor, orgId, "campaign.submit") ? <ButtonLink href={`/app/campaigns/${c.id}/review`}>Review and submit</ButtonLink> : undefined} />
              <ReadinessList readiness={readiness} />
            </Card>
          )}
          <Card>
            <CardHeader title="Approval log" description="Who authorised this campaign, its approved budget and configuration." />
            {full.approvals.length === 0 ? (
              <p className="text-sm text-ink-500">No approval decisions yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {full.approvals.map((a) => (
                  <li key={a.id} className="rounded-md bg-ink-50 p-2">
                    <span className="font-medium">{humanize(a.stage)} {a.decision.replace("_", " ")}</span> by {nameOf(a.decidedById)} on {formatDateTime(a.createdAt)} (version {a.campaignVersion})
                    {a.approvedBudget !== null && <> · budget {formatINR(a.approvedBudget)}, max {formatINR(a.maxAuthorisedSpend)}</>}
                    {a.note && <div className="text-xs text-ink-600">“{a.note}”</div>}
                    <div className="text-[11px] text-ink-400">Fingerprint {a.configHash.slice(0, 16)}…</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <DescriptionList
              items={[
                { label: "Schedule", value: `${formatDate(c.startDate)} to ${formatDate(c.endDate)}` },
                { label: "Maximum authorised spend", value: formatINR(c.maxAuthorisedSpend) },
                { label: "Spend alert", value: `${c.alertThresholdPct}% of budget` },
                { label: "Targeting", value: full.targets.map((t) => `${t.location.name} (${t.targeting.radiusKm} km)`).join(", ") },
                { label: "Claims", value: humanize(c.claimsStatus) },
                { label: "Version", value: String(c.version) },
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Activity" />
            <ol className="space-y-2 text-xs">
              {history.map((h) => (
                <li key={h.id}>
                  <div className="text-ink-500">{formatDateTime(h.createdAt)} · {h.actorLabel.split(" <")[0]}</div>
                  <div>{h.summary}</div>
                </li>
              ))}
            </ol>
          </Card>
          {can(actor, orgId, "campaign.edit") && ["draft", "changes_requested", "pending_approval", "pending_funding", "ready_to_publish"].includes(c.status) && (
            <Modal trigger="Cancel campaign" title="Cancel this campaign?" triggerVariant="ghost">
              <ActionForm action={cancelAction.bind(null, c.id)}>
                <p className="text-sm">Any reserved budget is released. This cannot be undone.</p>
                <TextAreaField label="Reason" name="reason" required rows={2} />
                <SubmitButton variant="danger">Cancel campaign</SubmitButton>
              </ActionForm>
            </Modal>
          )}
          {can(actor, orgId, "campaign.edit") && ["completed", "cancelled", "failed", "rejected", "demo_published"].includes(c.status) && (
            <ActionForm action={archiveAction.bind(null, c.id)}><SubmitButton variant="ghost">Archive</SubmitButton></ActionForm>
          )}
        </div>
      </div>
    </>
  );
}
