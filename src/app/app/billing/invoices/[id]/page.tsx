import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/badge";
import { PrintButton } from "@/components/app/print-button";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getSetting } from "@/server/flags";
import { getInvoice } from "@/server/services/billing";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireOrgActor();
  const db = getDb();
  const { invoice: inv, lines, organisation: org } = await getInvoice(db, actor, id);
  const supplier = await getSetting(db, "supplier_details", { name: "AutoSutra (legal entity name to be configured)", address: "Registered address to be configured", gstin: "GSTIN to be configured" });
  return (
    <>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/app/billing" className="text-sm text-road-600 hover:underline">← Billing</Link>
        <PrintButton />
      </div>
      <article className="mx-auto max-w-3xl rounded-xl border border-ink-200 bg-white p-8 shadow-sm print:border-0 print:shadow-none">
        <header className="flex flex-wrap justify-between gap-4 border-b border-ink-100 pb-4">
          <div>
            <h1 className="text-xl font-bold">Tax invoice</h1>
            <div className="text-sm text-ink-600">{inv.number}</div>
          </div>
          <StatusBadge status={inv.status} />
        </header>
        <div className="mt-4 grid gap-6 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase text-ink-500">From</div>
            <div className="font-medium">{supplier.name}</div>
            <div>{supplier.address}</div>
            <div>GSTIN: {supplier.gstin}</div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-ink-500">Billed to</div>
            <div className="font-medium">{org.legalName ?? org.name}</div>
            <div>{org.billingAddress ?? "–"}</div>
            <div>{org.billingState ?? ""}</div>
            {org.gstin && <div>GSTIN: {org.gstin}</div>}
          </div>
        </div>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-ink-500">Issued</dt><dd>{formatDate(inv.issuedAt)}</dd></div>
          <div><dt className="text-xs text-ink-500">Due</dt><dd>{formatDate(inv.dueAt)}</dd></div>
          <div><dt className="text-xs text-ink-500">Paid</dt><dd>{formatDate(inv.paidAt)}</dd></div>
        </dl>
        <table className="mt-6 w-full text-sm">
          <thead><tr className="border-b border-ink-200 text-left text-xs uppercase text-ink-500"><th className="py-2">Description</th><th className="text-right">Amount</th><th className="text-right">GST</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-ink-100"><td className="py-2">{l.description}<div className="text-xs text-ink-500">SAC 998365 (to be confirmed by tax adviser)</div></td><td className="text-right tabular-nums">{formatINR(l.amount)}</td><td className="text-right tabular-nums">{formatINR(l.tax)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td className="pt-3 text-right" colSpan={2}>Subtotal</td><td className="pt-3 text-right tabular-nums">{formatINR(inv.subtotal)}</td></tr>
            <tr><td className="text-right" colSpan={2}>{inv.taxNote}</td><td className="text-right tabular-nums">{formatINR(inv.tax)}</td></tr>
            <tr className="font-bold"><td className="pt-2 text-right" colSpan={2}>Total</td><td className="pt-2 text-right tabular-nums">{formatINR(inv.total)}</td></tr>
          </tfoot>
        </table>
        <p className="mt-6 text-xs text-ink-500">This invoice covers AutoSutra software and services only. Advertising spend is billed by the ad platforms or held under a separate funding arrangement.</p>
      </article>
    </>
  );
}
