import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { StatusBadge, humanize } from "@/components/ui/badge";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/ui/filter-bar";
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
      <PageHeader title="Campaigns" description="Every campaign shows each platform's status separately. Active means the platform confirmed it." actions={canCreate && <ButtonLink href="/app/campaigns/new"><Plus />New campaign</ButtonLink>} />
      <FilterBar resetHref="/app/campaigns" active={Object.values(sp).some(Boolean)}>
        <FilterSearch defaultValue={sp.q} placeholder="Campaign name" />
        <FilterSelect name="status" label="Status" defaultValue={sp.status} options={STATUSES.map((s) => ({ value: s, label: humanize(s) }))} />
        <FilterSelect name="dealershipId" label="Dealership" defaultValue={sp.dealershipId} options={dealers.map((d) => ({ value: d.id, label: d.name }))} />
        <FilterSelect name="objective" label="Objective" defaultValue={sp.objective} options={OBJECTIVES} />
      </FilterBar>
      {rows.length === 0 ? (
        <EmptyState icon={<Megaphone />} title="No campaigns found" description="Start with a template for test drives, launches, service camps and more." action={canCreate && <ButtonLink href="/app/campaigns/new">Create a campaign</ButtonLink>} />
      ) : (
        <>
        <ul className="space-y-3 md:hidden">
          {rows.map((r) => (
            <li key={r.campaign.id}>
              <Link href={`/app/campaigns/${r.campaign.id}`} className="block rounded-[var(--radius-card)] border border-ink-200/80 bg-white p-4 shadow-[var(--shadow-card)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-ink-950">{r.campaign.name}</div>
                    <div className="truncate text-xs text-ink-500">{objectiveDef(r.campaign.objective)?.label} · {r.locationName}</div>
                  </div>
                  <span className="flex-none"><StatusBadge status={r.campaign.status} /></span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span className="tabular-nums font-medium">{formatINR(r.budget, { decimals: false })}</span>
                  <span className="text-xs text-ink-500">{r.campaign.startDate ? `${formatDate(r.campaign.startDate)} to ${formatDate(r.campaign.endDate)}` : "Dates not set"}</span>
                </div>
                {r.platforms.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.platforms.map((p) => {
                      const [provider, status] = p.split(":");
                      return <StatusBadge key={p} status={status} label={`${provider === "meta" ? "Meta" : "Google"}: ${humanize(status)}`} />;
                    })}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
        <Table className="hidden md:block">
          <THead><tr><Th>Campaign</Th><Th>Location</Th><Th>Status</Th><Th>Platforms</Th><Th>Planned budget</Th><Th>Dates</Th></tr></THead>
          <TBody>
            {rows.map((r) => (
              <tr key={r.campaign.id}>
                <Td>
                  <Link href={`/app/campaigns/${r.campaign.id}`} className="font-semibold text-ink-950 hover:text-road-600">{r.campaign.name}</Link>
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
        </>
      )}
    </>
  );
}
