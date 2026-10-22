import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { StatusBadge, humanize } from "@/components/ui/badge";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { OBJECTIVES, objectiveDef } from "@/lib/objectives";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { can } from "@/server/auth/context";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listCampaigns } from "@/server/services/campaigns";
import { listDealerships } from "@/server/services/dealerships";

export const metadata: Metadata = { title: "Campaigns" };

const STATUSES = ["draft", "pending_approval", "changes_requested", "pending_funding", "ready_to_publish", "publishing", "active", "partially_published", "demo_published", "paused", "rejected", "failed", "completed", "cancelled", "archived"];

type SP = { status?: string; dealershipId?: string; objective?: string; q?: string };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const actor = await requireOrgActor();
  const db = getDb();
  const orgId = actor.membership.organisationId;
  const [rows, dealers] = await Promise.all([listCampaigns(db, actor, orgId, sp), listDealerships(db, actor, orgId)]);
  const canCreate = can(actor, orgId, "campaign.edit");
  return (
    <>
      <PageHeader title="Campaigns" description="Every campaign shows each platform's status separately. Active means the platform confirmed it." actions={canCreate && <ButtonLink href="/app/campaigns/new">New campaign</ButtonLink>} />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-600">Search</span>
          <input name="q" defaultValue={sp.q} className="h-9 rounded-md border border-ink-200 px-2" placeholder="Campaign name" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-600">Status</span>
          <select name="status" defaultValue={sp.status ?? ""} className="h-9 rounded-md border border-ink-200 px-2">
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-600">Dealership</span>
          <select name="dealershipId" defaultValue={sp.dealershipId ?? ""} className="h-9 rounded-md border border-ink-200 px-2">
            <option value="">All</option>
            {dealers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-600">Objective</span>
          <select name="objective" defaultValue={sp.objective ?? ""} className="h-9 rounded-md border border-ink-200 px-2">
            <option value="">All</option>
            {OBJECTIVES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <button type="submit" className="h-9 rounded-md bg-ink-900 px-3 font-semibold text-white">Filter</button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No campaigns found" description="Start with a template for test drives, launches, service camps and more." action={canCreate && <ButtonLink href="/app/campaigns/new">Create a campaign</ButtonLink>} />
      ) : (
        <Table>
          <THead><tr><Th>Campaign</Th><Th>Location</Th><Th>Status</Th><Th>Platforms</Th><Th>Planned budget</Th><Th>Dates</Th></tr></THead>
          <TBody>
            {rows.map((r) => (
              <tr key={r.campaign.id}>
                <Td>
                  <Link href={`/app/campaigns/${r.campaign.id}`} className="font-semibold text-road-600 hover:underline">{r.campaign.name}</Link>
                  <div className="text-xs text-ink-500">{objectiveDef(r.campaign.objective)?.label}</div>
                </Td>
                <Td className="text-sm">{r.dealershipName}<div className="text-xs text-ink-500">{r.locationName}</div></Td>
                <Td><StatusBadge status={r.campaign.status} /></Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {r.platforms.map((p) => {
                      const [provider, status] = p.split(":");
                      return <StatusBadge key={p} status={status} label={`${provider === "meta" ? "Meta" : "Google"}: ${humanize(status)}`} />;
                    })}
                  </div>
                </Td>
                <Td className="tabular-nums">{formatINR(r.budget, { decimals: false })}</Td>
                <Td className="whitespace-nowrap text-xs">{formatDate(r.campaign.startDate)} to {formatDate(r.campaign.endDate)}</Td>
              </tr>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
