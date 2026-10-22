import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { ORG_TYPE_OPTIONS, labelFor } from "@/lib/catalog";
import { formatDate } from "@/lib/format";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listAllOrganisations } from "@/server/services/organisations";

export const metadata: Metadata = { title: "Organisations" };

export default async function OrgsPage({ searchParams }: { searchParams: Promise<{ verification?: string }> }) {
  const { verification } = await searchParams;
  const actor = await requireActor();
  const rows = (await listAllOrganisations(getDb(), actor)).filter((o) => !verification || o.verificationStatus === verification);
  return (
    <>
      <PageHeader title="Organisations" />
      <Table>
        <THead><tr><Th>Organisation</Th><Th>Type</Th><Th>GSTIN</Th><Th>Verification</Th><Th>Managed service</Th><Th>Status</Th><Th>Created</Th></tr></THead>
        <TBody>
          {rows.map((o) => (
            <tr key={o.id}>
              <Td><Link href={`/admin/organisations/${o.id}`} className="font-medium text-road-600 hover:underline">{o.name}</Link><div className="text-xs text-ink-500">{o.legalName}</div></Td>
              <Td className="text-sm">{labelFor(ORG_TYPE_OPTIONS, o.type)}</Td>
              <Td className="text-xs">{o.gstin ?? "–"}</Td>
              <Td><StatusBadge status={o.verificationStatus} /></Td>
              <Td className="text-xs">{o.managedServiceActive ? "Active" : o.managedServiceRequested ? "Requested" : "–"}</Td>
              <Td><StatusBadge status={o.status} /></Td>
              <Td className="text-xs">{formatDate(o.createdAt)}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </>
  );
}
