import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/card";
import { ReportView } from "@/components/app/report-view";
import { OBJECTIVES } from "@/lib/objectives";
import { can, requireOrg } from "@/server/auth/context";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listCampaigns } from "@/server/services/campaigns";
import { listDealerships, listLocations } from "@/server/services/dealerships";
import { buildReport, normaliseFilter } from "@/server/services/reports";
import { LEAD_STATUSES } from "@/server/services/leads";

export const metadata: Metadata = { title: "Reports" };

const select = "h-9 rounded-md border border-ink-200 px-2 text-sm";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const raw = await searchParams;
  const actor = await requireOrgActor();
  const orgId = actor.membership.organisationId;
  requireOrg(actor, orgId, "reports.view");
  const db = getDb();
  const f = normaliseFilter(raw);
  const [report, dealers, locs, camps] = await Promise.all([buildReport(db, actor, orgId, f), listDealerships(db, actor, orgId), listLocations(db, actor, orgId), listCampaigns(db, actor, orgId)]);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
  return (
    <>
      <PageHeader
        title="Reports"
        description="Provider-reported delivery and spend alongside the enquiries, test drives and sales your team records."
        actions={can(actor, orgId, "reports.export") && <a href={`/api/reports/export?${qs}`} className="text-sm font-semibold text-road-600">Export CSV</a>}
      />
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-ink-200 bg-white p-3 text-sm">
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-600">From</span><input type="date" name="from" defaultValue={f.from} className={select} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-600">To</span><input type="date" name="to" defaultValue={f.to} className={select} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-600">Dealership</span><select name="dealershipId" defaultValue={f.dealershipId ?? ""} className={select}><option value="">All</option>{dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-600">Location</span><select name="locationId" defaultValue={f.locationId ?? ""} className={select}><option value="">All</option>{locs.map((l) => <option key={l.location.id} value={l.location.id}>{l.location.name}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-600">Campaign</span><select name="campaignId" defaultValue={f.campaignId ?? ""} className={select}><option value="">All</option>{camps.map((c) => <option key={c.campaign.id} value={c.campaign.id}>{c.campaign.name}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-600">Platform</span><select name="provider" defaultValue={f.provider ?? ""} className={select}><option value="">Both</option><option value="meta">Meta Ads</option><option value="google">Google Ads</option></select></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-600">Objective</span><select name="objective" defaultValue={f.objective ?? ""} className={select}><option value="">All</option>{OBJECTIVES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-600">Brand</span><input name="brand" defaultValue={f.brand} className={select} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-600">Model</span><input name="model" defaultValue={f.model} className={select} /></label>
        <label className="flex flex-col gap-1"><span className="text-xs text-ink-600">Lead status</span><select name="leadStatus" defaultValue={f.leadStatus ?? ""} className={select}><option value="">All</option>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select></label>
        <button type="submit" className="h-9 rounded-md bg-ink-900 px-3 font-semibold text-white">Apply</button>
      </form>
      <ReportView report={report} />
    </>
  );
}
