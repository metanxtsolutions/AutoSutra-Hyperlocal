import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, isNotNull } from "drizzle-orm";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Alert, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { SelectField, TextAreaField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form";
import { formatINR } from "@/lib/money";
import { formatDate, formatDateTime, relativeAge } from "@/lib/format";
import { objectiveDef } from "@/lib/objectives";
import { hasPlatform, requirePlatform } from "@/server/auth/context";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { campaignNotes, users } from "@/server/db/schema";
import { checkReadiness, loadCampaign, totalBudget } from "@/server/services/campaigns";
import { ReadinessList } from "@/app/app/campaigns/[id]/readiness-list";
import { internalApproveAction, opsManagedAction, opsNoteAction, opsPauseAction, opsPublishAction, opsRequestChangesAction } from "../../actions";

export const metadata: Metadata = { title: "Campaign (operations)" };

export default async function OpsCampaign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  requirePlatform(actor, "platform.view_all");
  const db = getDb();
  const full = await loadCampaign(db, id);
  if (!full) notFound();
  const c = full.campaign;
  const ops = hasPlatform(actor, "platform.campaign_ops");
  const [notes, staff, readiness] = await Promise.all([
    db.select({ n: campaignNotes, author: users.name }).from(campaignNotes).innerJoin(users, eq(users.id, campaignNotes.authorId)).where(eq(campaignNotes.campaignId, id)).orderBy(desc(campaignNotes.createdAt)),
    db.select({ id: users.id, name: users.name }).from(users).where(isNotNull(users.platformRole)),
    checkReadiness(db, full),
  ]);
  const customerApproval = full.approvals.find((a) => a.id === c.currentApprovalId);
  const internal = customerApproval && full.approvals.find((a) => a.stage === "internal" && a.decision === "approved" && a.configHash === customerApproval.configHash);
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/campaigns" className="hover:underline">Campaign operations</Link>} title={c.name} description={`${full.organisation.name} · ${full.dealership.name}: ${full.primaryLocation.name} · ${objectiveDef(c.objective)?.label}`} actions={<><StatusBadge status={c.status} />{c.managed && <Badge tone="brand">Managed</Badge>}</>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Approval and authorisation" />
            {customerApproval ? (
              <DescriptionList items={[
                { label: "Customer approval", value: `${formatDateTime(customerApproval.createdAt)} (version ${customerApproval.campaignVersion})` },
                { label: "Approved budget", value: formatINR(customerApproval.approvedBudget) },
                { label: "Maximum authorised spend", value: formatINR(customerApproval.maxAuthorisedSpend) },
                { label: "Configuration fingerprint", value: <code className="text-xs">{customerApproval.configHash.slice(0, 24)}…</code> },
                { label: "Operations sign-off", value: internal ? `Yes, ${formatDateTime(internal.createdAt)}` : c.managed ? "Required, not yet given" : "Not required (self-service)" },
              ]} />
            ) : <p className="text-sm text-ink-600">No current customer approval. Planned budget {formatINR(totalBudget(full))}.</p>}
            <p className="mt-3 text-xs text-ink-500">Operators cannot edit the configuration or raise the authorised spend. To change anything, request a revision; the customer edits and re-approves.</p>
          </Card>
          <Card>
            <CardHeader title="Platforms" />
            {full.platforms.map(({ platform: p, account }) => (
              <div key={p.id} className="mb-3 rounded-lg border border-ink-200 p-3 text-sm">
                <div className="flex justify-between"><span className="font-medium">{p.provider} · {p.providerCampaignType}</span><span className="flex gap-2">{p.mode && <Badge tone={p.mode === "live" ? "ok" : "demo"}>{p.mode}</Badge>}<StatusBadge status={p.status} /></span></div>
                <div className="mt-1 text-xs text-ink-600">Account {account?.name ?? "–"} · reported spend {formatINR(p.reportedSpend)} · synced {relativeAge(p.lastSyncedAt)} · provider status {p.providerStatusRaw ?? "–"}</div>
                {p.lastError && <div className="mt-2"><Alert tone="bad">{p.lastError}</Alert></div>}
                {p.lastSyncError && <div className="mt-2"><Alert tone="warn">{p.lastSyncError}</Alert></div>}
                {ops && c.managed && p.publishedAt && (p.status === "active" || p.status === "paused") && (
                  <ActionForm action={opsPauseAction.bind(null, p.id, p.status === "active")} className="mt-2"><SubmitButton size="sm" variant="secondary">{p.status === "active" ? "Pause" : "Resume"}</SubmitButton></ActionForm>
                )}
              </div>
            ))}
          </Card>
          <Card>
            <CardHeader title="Checks" />
            <ReadinessList readiness={readiness} />
          </Card>
          <Card>
            <CardHeader title="Internal notes and optimisation log" />
            {ops && (
              <ActionForm action={opsNoteAction.bind(null, id)} resetOnSuccess>
                <SelectField label="Type" name="kind" options={[{ value: "internal_note", label: "Internal note" }, { value: "optimisation", label: "Optimisation action" }]} />
                <TextAreaField label="Note" name="body" required rows={2} />
                <SubmitButton size="sm" variant="secondary">Add</SubmitButton>
              </ActionForm>
            )}
            <ul className="mt-4 space-y-2 text-sm">
              {notes.map(({ n, author }) => <li key={n.id} className="rounded bg-ink-50 p-2"><div className="text-xs text-ink-500">{formatDateTime(n.createdAt)} · {author} · {n.kind.replace("_", " ")}</div>{n.body}</li>)}
            </ul>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <DescriptionList items={[
              { label: "Schedule", value: `${formatDate(c.startDate)} to ${formatDate(c.endDate)}` },
              { label: "Targeting", value: full.targets.map((t) => `${t.location.name} ${t.targeting.radiusKm} km`).join(", ") },
              { label: "Landing page", value: full.creative?.landingUrl || "–" },
            ]} />
          </Card>
          {ops && (
            <>
              <Card>
                <CardHeader title="Managed service" />
                <ActionForm action={opsManagedAction.bind(null, id)}>
                  <Checkbox name="managed" defaultChecked={c.managed} label="AutoSutra manages this campaign" />
                  <SelectField label="Campaign manager" name="managerId" defaultValue={c.assignedManagerId ?? ""} placeholder="Unassigned" options={staff.map((s) => ({ value: s.id, label: s.name }))} />
                  <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
                </ActionForm>
              </Card>
              {c.managed && ["ready_to_publish", "pending_funding"].includes(c.status) && !internal && (
                <Card>
                  <CardHeader title="Operations sign-off" description="Confirms targeting, creative and account setup match the customer's approved configuration." />
                  <ActionForm action={internalApproveAction.bind(null, id)}>
                    <TextAreaField label="Note" name="note" rows={2} />
                    <SubmitButton size="sm">Sign off for launch</SubmitButton>
                  </ActionForm>
                </Card>
              )}
              {c.managed && c.status === "ready_to_publish" && internal && (
                <Card>
                  <ActionForm action={opsPublishAction.bind(null, id)}><SubmitButton>Launch campaign</SubmitButton></ActionForm>
                </Card>
              )}
              {["pending_approval", "pending_funding", "ready_to_publish"].includes(c.status) && (
                <Card>
                  <CardHeader title="Request revision" />
                  <ActionForm action={opsRequestChangesAction.bind(null, id)}>
                    <TextAreaField label="What needs to change" name="reason" required rows={3} />
                    <SubmitButton size="sm" variant="secondary">Send to customer</SubmitButton>
                  </ActionForm>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
