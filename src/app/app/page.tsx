import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { ReportView } from "@/components/app/report-view";
import { formatDateTime } from "@/lib/format";
import { can } from "@/server/auth/context";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import { listCampaigns } from "@/server/services/campaigns";
import { listLeads } from "@/server/services/leads";
import { onboardingStatus } from "@/server/services/organisations";
import { buildReport, normaliseFilter } from "@/server/services/reports";

export const metadata: Metadata = { title: "Dashboard" };

const ATTENTION = ["pending_approval", "changes_requested", "pending_funding", "ready_to_publish", "failed", "partially_published", "rejected"];

export default async function DashboardPage() {
  const actor = await requireOrgActor();
  const db = getDb();
  const orgId = actor.membership.organisationId;
  const steps = await onboardingStatus(db, actor);
  const pending = steps.filter((s) => !s.done);
  const canReports = can(actor, orgId, "reports.view");
  const canCampaigns = can(actor, orgId, "campaign.view");
  const canLeads = can(actor, orgId, "lead.view");
  const [report, camps, recentLeads, alerts] = await Promise.all([
    canReports ? buildReport(db, actor, orgId, normaliseFilter({})) : null,
    canCampaigns ? listCampaigns(db, actor, orgId) : [],
    canLeads ? listLeads(db, actor, orgId, {}, 6) : [],
    db.select().from(notifications).where(and(eq(notifications.organisationId, orgId), inArray(notifications.severity, ["warning", "critical"]))).orderBy(desc(notifications.createdAt)).limit(5),
  ]);
  const attention = camps.filter((c) => ATTENTION.includes(c.campaign.status));
  return (
    <>
      <PageHeader
        title={`Welcome, ${actor.user.name.split(" ")[0]}`}
        description={`${actor.membership.organisationName} · last 30 days`}
        actions={can(actor, orgId, "campaign.edit") && <ButtonLink href="/app/campaigns/new">New campaign</ButtonLink>}
      />
      {pending.length > 0 && (
        <Card className="mb-6">
          <CardHeader title="Finish setting up" description={`${steps.length - pending.length} of ${steps.length} steps complete`} actions={<Link href="/app/onboarding" className="text-sm font-semibold text-road-600">Open checklist</Link>} />
          <ul className="flex flex-wrap gap-2 text-sm">
            {pending.map((s) => <li key={s.key}><Link href={s.href} className="inline-block rounded-full bg-warn-100 px-3 py-1 text-ink-900 hover:underline">{s.label}</Link></li>)}
          </ul>
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">{report ? <ReportView report={report} compact /> : <Card><p className="text-sm text-ink-600">Your role does not include reports.</p></Card>}</div>
        <div className="space-y-6">
          {canCampaigns && (
            <Card>
              <CardHeader title="Campaigns needing attention" actions={<Link href="/app/campaigns" className="text-sm text-road-600">All</Link>} />
              {attention.length === 0 ? <p className="text-sm text-ink-500">Nothing needs action.</p> : (
                <ul className="space-y-2 text-sm">
                  {attention.slice(0, 8).map((c) => (
                    <li key={c.campaign.id} className="flex items-center justify-between gap-2">
                      <Link href={`/app/campaigns/${c.campaign.id}`} className="truncate text-road-600 hover:underline">{c.campaign.name}</Link>
                      <StatusBadge status={c.campaign.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {canLeads && (
            <Card>
              <CardHeader title="Latest enquiries" actions={<Link href="/app/leads" className="text-sm text-road-600">Lead centre</Link>} />
              {recentLeads.length === 0 ? <p className="text-sm text-ink-500">No enquiries yet.</p> : (
                <ul className="space-y-2 text-sm">
                  {recentLeads.map((l) => (
                    <li key={l.lead.id} className="flex items-center justify-between gap-2">
                      <Link href={`/app/leads/${l.lead.id}`} className="truncate text-road-600 hover:underline">{l.lead.anonymisedAt ? "Anonymised" : l.lead.name ?? l.lead.phone}</Link>
                      <StatusBadge status={l.lead.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <Card>
            <CardHeader title="Alerts" actions={<Link href="/app/notifications" className="text-sm text-road-600">All notifications</Link>} />
            {alerts.length === 0 ? <p className="text-sm text-ink-500">No warnings.</p> : (
              <ul className="space-y-2 text-sm">
                {alerts.map((a) => (
                  <li key={a.id}>
                    <span className={a.severity === "critical" ? "font-semibold text-bad-700" : "font-semibold text-warn-700"}>{a.severity === "critical" ? "⚠ Critical" : "! Warning"}</span>{" "}
                    {a.link ? <Link href={a.link} className="hover:underline">{a.title}</Link> : a.title}
                    <div className="text-xs text-ink-500">{formatDateTime(a.createdAt)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
