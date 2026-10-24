import type { Metadata } from "next";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/ui/card";
import { humanize } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { FilterBar, FilterInput, FilterSelect } from "@/components/ui/filter-bar";
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
        actions={can(actor, orgId, "reports.export") && <a href={`/api/reports/export?${qs}`} className={buttonClass("secondary")}><Download />Export CSV</a>}
      />
      <FilterBar resetHref="/app/reports" active={Object.keys(raw).some((k) => raw[k])} className="mb-6">
        <FilterInput type="date" name="from" label="From" defaultValue={f.from} />
        <FilterInput type="date" name="to" label="To" defaultValue={f.to} />
        <FilterSelect name="dealershipId" label="Dealership" defaultValue={f.dealershipId} options={dealers.map((d) => ({ value: d.id, label: d.name }))} />
        <FilterSelect name="locationId" label="Location" defaultValue={f.locationId} options={locs.map((l) => ({ value: l.location.id, label: l.location.name }))} />
        <FilterSelect name="campaignId" label="Campaign" defaultValue={f.campaignId} options={camps.map((c) => ({ value: c.campaign.id, label: c.campaign.name }))} />
        <FilterSelect name="provider" label="Platform" allLabel="Both" defaultValue={f.provider} options={[{ value: "meta", label: "Meta Ads" }, { value: "google", label: "Google Ads" }]} />
        <FilterSelect name="objective" label="Objective" defaultValue={f.objective} options={OBJECTIVES} />
        <FilterInput name="brand" label="Brand" defaultValue={f.brand} />
        <FilterInput name="model" label="Model" defaultValue={f.model} />
        <FilterSelect name="leadStatus" label="Lead status" defaultValue={f.leadStatus} options={LEAD_STATUSES.map((s) => ({ value: s, label: humanize(s) }))} />
      </FilterBar>
      <ReportView report={report} />
    </>
  );
}
