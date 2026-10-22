import Link from "next/link";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/card";
import type { auditLogs } from "@/server/db/schema";
import { AUDIT_PAGE_SIZE } from "@/server/services/audit-log";
import { formatDateTime } from "@/lib/format";

type Row = typeof auditLogs.$inferSelect;

export function AuditFilters({ basePath, values }: { basePath: string; values: Record<string, string | undefined> }) {
  return (
    <form method="get" action={basePath} className="mb-4 flex flex-wrap items-end gap-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-ink-600">Search</span>
        <input name="q" defaultValue={values.q} className="h-9 rounded-md border border-ink-200 px-2" placeholder="Summary or person" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-ink-600">Action starts with</span>
        <input name="action" defaultValue={values.action} className="h-9 rounded-md border border-ink-200 px-2" placeholder="e.g. campaign." />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-ink-600">From</span>
        <input type="date" name="from" defaultValue={values.from} className="h-9 rounded-md border border-ink-200 px-2" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-ink-600">To</span>
        <input type="date" name="to" defaultValue={values.to} className="h-9 rounded-md border border-ink-200 px-2" />
      </label>
      <button className="h-9 rounded-md bg-ink-900 px-3 font-semibold text-white" type="submit">Filter</button>
    </form>
  );
}

export function AuditTable({ rows, page, basePath, query }: { rows: Row[]; page: number; basePath: string; query: Record<string, string | undefined> }) {
  const hasMore = rows.length > AUDIT_PAGE_SIZE;
  const shown = rows.slice(0, AUDIT_PAGE_SIZE);
  const link = (p: number) => {
    const qs = new URLSearchParams(Object.entries({ ...query, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `${basePath}?${qs}`;
  };
  if (!shown.length) return <EmptyState title="No audit records match" />;
  return (
    <>
      <Table>
        <THead><tr><Th>When (IST)</Th><Th>Who</Th><Th>Action</Th><Th>Summary</Th></tr></THead>
        <TBody>
          {shown.map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap text-xs text-ink-600">{formatDateTime(r.createdAt)}</Td>
              <Td className="text-xs">{r.actorLabel}</Td>
              <Td><code className="text-xs">{r.action}</code></Td>
              <Td className="text-sm">
                {r.summary}
                {Object.keys(r.data as object).length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-ink-500">Details</summary>
                    <pre className="mt-1 max-w-xl overflow-x-auto rounded bg-ink-50 p-2 text-[11px]">{JSON.stringify(r.data, null, 2)}</pre>
                  </details>
                )}
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>
      <div className="mt-3 flex justify-between text-sm">
        {page > 1 ? <Link href={link(page - 1)} className="text-road-600">← Newer</Link> : <span />}
        {hasMore && <Link href={link(page + 1)} className="text-road-600">Older →</Link>}
      </div>
    </>
  );
}
