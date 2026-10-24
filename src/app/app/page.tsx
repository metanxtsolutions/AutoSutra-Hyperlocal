import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { AlertTriangle, ArrowRight, ChartColumn, CheckCircle2, Circle, Megaphone, OctagonAlert, Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EnquiryChart, FreshnessWarnings, FunnelCard, KpiGrid, PlatformCards, SpendChart } from "@/components/app/report-view";
import { formatDateTime, relativeAge } from "@/lib/format";
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

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

function ListLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-road-600 hover:text-road-700">{children}<ArrowRight aria-hidden className="h-3.5 w-3.5" /></Link>;
}

export default async function DashboardPage() {
  const actor = await requireOrgActor();
  const db = getDb();
  const orgId = actor.membership.organisationId;
  const steps = await onboardingStatus(db, actor);
  const pending = steps.filter((s) => !s.done);
  const done = steps.length - pending.length;
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
  const today = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <>
      <PageHeader
        eyebrow={today}
        title={`${greeting()}, ${actor.user.name.split(" ")[0]}`}
        description={`Here is how ${actor.membership.organisationName} is doing over the last 30 days.`}
        actions={
          <>
            {canReports && <ButtonLink href="/app/reports" variant="secondary"><ChartColumn />Full report</ButtonLink>}
            {can(actor, orgId, "campaign.edit") && <ButtonLink href="/app/campaigns/new"><Plus />New campaign</ButtonLink>}
          </>
        }
      />

      {pending.length > 0 && (
        <Card className="mb-6" padded={false}>
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold tracking-tight">Finish setting up</h2>
              <p className="mt-0.5 text-sm text-ink-500">{done} of {steps.length} steps complete. A few more and you are ready to advertise.</p>
              <div className="mt-3 h-2 max-w-md rounded-full bg-ink-100" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label="Setup progress">
                <div className="h-2 rounded-full bg-road-600" style={{ width: `${(done / steps.length) * 100}%` }} />
              </div>
            </div>
            <ButtonLink href="/app/onboarding" variant="secondary" size="sm">Open checklist</ButtonLink>
          </div>
          <ul className="divide-y divide-ink-100 border-t border-ink-100">
            {pending.slice(0, 3).map((s) => (
              <li key={s.key}>
                <Link href={s.href} className="group flex items-center gap-3 px-5 py-3 hover:bg-ink-50/70">
                  <Circle aria-hidden className="h-4 w-4 flex-none text-ink-300" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-900">{s.label}</span>
                    <span className="block truncate text-xs text-ink-500">{s.detail}</span>
                  </span>
                  <ArrowRight aria-hidden className="h-4 w-4 flex-none text-ink-300 group-hover:text-ink-600" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="space-y-6">
        {report ? (
          <>
            <FreshnessWarnings report={report} />
            <KpiGrid report={report} />
          </>
        ) : (
          <Card><p className="text-sm text-ink-600">Your role does not include reports. Ask an owner or manager if you need them.</p></Card>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {report && <SpendChart report={report} />}
            {report && <EnquiryChart report={report} />}
            {report && <PlatformCards report={report} />}
          </div>

          <div className="space-y-6">
            {report && <FunnelCard report={report} />}

            {canCampaigns && (
              <Card padded={false}>
                <div className="px-5 pt-5"><CardHeader title="Needs your attention" actions={<ListLink href="/app/campaigns">Campaigns</ListLink>} /></div>
                {attention.length === 0 ? (
                  <div className="flex items-center gap-2 px-5 pb-5 text-sm text-ink-500"><CheckCircle2 aria-hidden className="h-4 w-4 text-ok-500" />Nothing needs action right now.</div>
                ) : (
                  <ul className="divide-y divide-ink-100 border-t border-ink-100">
                    {attention.slice(0, 6).map((c) => (
                      <li key={c.campaign.id}>
                        <Link href={`/app/campaigns/${c.campaign.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50/70">
                          <span aria-hidden className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-road-50 text-road-600"><Megaphone className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink-900">{c.campaign.name}</span>
                            <span className="block truncate text-xs text-ink-500">{c.locationName}</span>
                          </span>
                          <StatusBadge status={c.campaign.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {canLeads && (
              <Card padded={false}>
                <div className="px-5 pt-5"><CardHeader title="Latest enquiries" actions={<ListLink href="/app/leads">Lead centre</ListLink>} /></div>
                {recentLeads.length === 0 ? (
                  <p className="px-5 pb-5 text-sm text-ink-500">No enquiries yet. They appear here as soon as a campaign captures one.</p>
                ) : (
                  <ul className="divide-y divide-ink-100 border-t border-ink-100">
                    {recentLeads.map((l) => {
                      const name = l.lead.anonymisedAt ? "Anonymised" : (l.lead.name ?? l.lead.phone ?? "Enquiry");
                      return (
                        <li key={l.lead.id}>
                          <Link href={`/app/leads/${l.lead.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50/70">
                            <span aria-hidden className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-700">{initials(name)}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-ink-900">{name}</span>
                              <span className="block truncate text-xs text-ink-500">{[l.locationName, relativeAge(l.lead.createdAt)].filter(Boolean).join(" · ")}</span>
                            </span>
                            <StatusBadge status={l.lead.status} />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            )}

            <Card padded={false}>
              <div className="px-5 pt-5"><CardHeader title="Alerts" actions={<ListLink href="/app/notifications">All notifications</ListLink>} /></div>
              {alerts.length === 0 ? (
                <div className="flex items-center gap-2 px-5 pb-5 text-sm text-ink-500"><CheckCircle2 aria-hidden className="h-4 w-4 text-ok-500" />No warnings.</div>
              ) : (
                <ul className="divide-y divide-ink-100 border-t border-ink-100">
                  {alerts.map((a) => {
                    const critical = a.severity === "critical";
                    const body = (
                      <>
                        {critical ? <OctagonAlert aria-hidden className="mt-0.5 h-4 w-4 flex-none text-bad-700" /> : <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 flex-none text-warn-700" />}
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-ink-900"><span className="sr-only">{critical ? "Critical: " : "Warning: "}</span>{a.title}</span>
                          <span className="block text-xs text-ink-500">{formatDateTime(a.createdAt)}</span>
                        </span>
                      </>
                    );
                    return (
                      <li key={a.id}>
                        {a.link ? <Link href={a.link} className="flex gap-3 px-5 py-3 hover:bg-ink-50/70">{body}</Link> : <div className="flex gap-3 px-5 py-3">{body}</div>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
