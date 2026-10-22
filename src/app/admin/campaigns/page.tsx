import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/card";
import { Badge, StatusBadge, humanize } from "@/components/ui/badge";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { formatINR } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { objectiveDef } from "@/lib/objectives";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listAllCampaigns } from "@/server/services/campaigns";

export const metadata: Metadata = { title: "Campaign operations" };

export default async function OpsCampaigns({ searchParams }: { searchParams: Promise<{ status?: string; managed?: string }> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const rows = await listAllCampaigns(getDb(), actor, { status: sp.status, managedOnly: sp.managed === "1" });
  return (
    <>
      <PageHeader title="Campaign operations" description="Customer approval comes first; managed campaigns then need operations sign-off before launch. Operators cannot change approved budgets or configuration." />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {[["All", ""], ["Managed only", "managed=1"], ["Ready to launch", "status=ready_to_publish&managed=1"], ["Awaiting customer", "status=pending_approval"], ["Failed", "status=failed"], ["Partially published", "status=partially_published"]].map(([l, q]) => (
          <Link key={l} href={`/admin/campaigns${q ? `?${q}` : ""}`} className="rounded-full border border-ink-200 bg-white px-3 py-1 hover:bg-ink-50">{l}</Link>
        ))}
      </div>
      <Table>
        <THead><tr><Th>Campaign</Th><Th>Organisation</Th><Th>Status</Th><Th>Platforms</Th><Th className="text-right">Budget</Th><Th>Updated</Th></tr></THead>
        <TBody>
          {rows.map((r) => (
            <tr key={r.campaign.id}>
              <Td><Link href={`/admin/campaigns/${r.campaign.id}`} className="font-medium text-road-600 hover:underline">{r.campaign.name}</Link>{r.campaign.managed && <Badge tone="brand" className="ml-2">Managed</Badge>}<div className="text-xs text-ink-500">{objectiveDef(r.campaign.objective)?.label} · {r.locationName}</div></Td>
              <Td className="text-sm">{r.organisationName}</Td>
              <Td><StatusBadge status={r.campaign.status} /></Td>
              <Td><div className="flex flex-wrap gap-1">{r.platforms.map((p) => { const [prov, st] = p.split(":"); return <StatusBadge key={p} status={st} label={`${prov}: ${humanize(st)}`} />; })}</div></Td>
              <Td className="text-right tabular-nums">{formatINR(r.budget, { decimals: false })}</Td>
              <Td className="text-xs">{formatDateTime(r.campaign.updatedAt)}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </>
  );
}
