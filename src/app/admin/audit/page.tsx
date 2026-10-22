import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/card";
import { AuditFilters, AuditTable } from "@/components/app/audit-table";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { platformAuditLog } from "@/server/services/audit-log";

export const metadata: Metadata = { title: "Audit logs" };

type SP = { q?: string; action?: string; from?: string; to?: string; page?: string };

export default async function AdminAudit({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const actor = await requireActor();
  const page = Number(sp.page) || 1;
  const rows = await platformAuditLog(getDb(), actor, { ...sp, page });
  return (
    <>
      <PageHeader title="Audit logs" description="All organisations. Append-only; enforced by database triggers." />
      <AuditFilters basePath="/admin/audit" values={sp} />
      <AuditTable rows={rows} page={page} basePath="/admin/audit" query={{ q: sp.q, action: sp.action, from: sp.from, to: sp.to }} />
    </>
  );
}
