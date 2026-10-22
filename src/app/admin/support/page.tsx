import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listAllTickets } from "@/server/services/support";

export const metadata: Metadata = { title: "Support tickets" };

export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const actor = await requireActor();
  const rows = await listAllTickets(getDb(), actor, !all);
  return (
    <>
      <PageHeader title="Support tickets" actions={<a className="text-sm text-road-600" href={all ? "?" : "?all=1"}>{all ? "Open only" : "Show all"}</a>} />
      <Table>
        <THead><tr><Th>Subject</Th><Th>Organisation</Th><Th>Category</Th><Th>Priority</Th><Th>Status</Th><Th>Updated</Th></tr></THead>
        <TBody>
          {rows.map(({ t, organisationName }) => (
            <tr key={t.id}>
              <Td><Link href={`/admin/support/${t.id}`} className="font-medium text-road-600 hover:underline">{t.subject}</Link></Td>
              <Td className="text-sm">{organisationName}</Td>
              <Td className="text-xs">{t.category.replace("_", " ")}</Td>
              <Td className="text-xs">{t.priority}</Td>
              <Td><StatusBadge status={t.status} /></Td>
              <Td className="text-xs">{formatDateTime(t.updatedAt)}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </>
  );
}
