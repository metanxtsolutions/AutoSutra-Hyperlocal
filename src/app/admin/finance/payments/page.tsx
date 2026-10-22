import type { Metadata } from "next";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { formatINR } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listPayments, listWebhookEvents } from "@/server/services/payments";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const actor = await requireActor();
  const db = getDb();
  const [rows, events] = await Promise.all([listPayments(db, actor, status), listWebhookEvents(db, actor)]);
  return (
    <>
      <PageHeader title="Payments" description="Gateway orders for invoices and advertising deposits. Status changes only through verified webhooks." />
      <form method="get" className="mb-4"><select name="status" defaultValue={status ?? ""} className="h-9 rounded-md border border-ink-200 px-2 text-sm"><option value="">All statuses</option>{["created", "pending", "captured", "failed", "refunded"].map((s) => <option key={s}>{s}</option>)}</select> <button className="h-9 rounded-md bg-ink-900 px-3 text-sm font-semibold text-white">Filter</button></form>
      <Table>
        <THead><tr><Th>Created</Th><Th>Purpose</Th><Th>Gateway order</Th><Th className="text-right">Amount</Th><Th className="text-right">Fees</Th><Th className="text-right">Refunded</Th><Th>Status</Th><Th>Failure</Th></tr></THead>
        <TBody>
          {rows.map((p) => (
            <tr key={p.id}>
              <Td className="text-xs">{formatDateTime(p.createdAt)}</Td>
              <Td className="text-xs">{p.purpose}</Td>
              <Td className="text-xs"><code>{p.gatewayOrderId}</code><div className="text-ink-400">{p.gatewayPaymentId}</div></Td>
              <Td className="text-right tabular-nums">{formatINR(p.amount)}</Td>
              <Td className="text-right tabular-nums text-xs">{p.gatewayFee !== null ? formatINR(p.gatewayFee) : "–"}</Td>
              <Td className="text-right tabular-nums text-xs">{p.refundedAmount ? formatINR(p.refundedAmount) : "–"}</Td>
              <Td><StatusBadge status={p.status} /></Td>
              <Td className="max-w-xs text-xs text-bad-700">{p.failureReason}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
      <Card className="mt-6">
        <CardHeader title="Recent verified webhook events" description="Duplicate deliveries are recorded once and acknowledged without reprocessing." />
        <ul className="space-y-1 text-xs">{events.map((e) => <li key={e.id}><code>{e.eventId}</code> · {e.gateway} · {e.eventType} · {formatDateTime(e.receivedAt)}</li>)}</ul>
      </Card>
    </>
  );
}
