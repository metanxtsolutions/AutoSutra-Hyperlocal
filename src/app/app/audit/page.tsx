import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/card";
import { AuditFilters, AuditTable } from "@/components/app/audit-table";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { orgAuditLog } from "@/server/services/audit-log";

export const metadata: Metadata = { title: "Audit log" };

type SP = { q?: string; action?: string; from?: string; to?: string; page?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const actor = await requireOrgActor();
  const page = Number(sp.page) || 1;
  const rows = await orgAuditLog(getDb(), actor, actor.membership.organisationId, { ...sp, page });
  return (
    <>
      <PageHeader title="Audit log" description="Every sensitive action in your organisation. Records cannot be edited or deleted." />
      <AuditFilters basePath="/app/audit" values={sp} />
      <AuditTable rows={rows} page={page} basePath="/app/audit" query={{ q: sp.q, action: sp.action, from: sp.from, to: sp.to }} />
    </>
  );
}
