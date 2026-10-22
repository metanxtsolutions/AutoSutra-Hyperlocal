import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Alert, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/card";
import { StatusBadge, humanize } from "@/components/ui/badge";
import { TextAreaField, TextField } from "@/components/ui/fields";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { formatINR } from "@/lib/money";
import { formatDateTime, relativeAge } from "@/lib/format";
import { can } from "@/server/auth/context";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { fundingMode } from "@/server/services/funding";
import { entryLines } from "@/server/services/ledger";
import { orgReconciliationStatus } from "@/server/services/reconciliation";
import { DEPOSIT_LIMITS, walletOverview } from "@/server/services/wallet";
import { depositAction, refundAction } from "./actions";

export const metadata: Metadata = { title: "Advertising budget wallet" };

const TYPE_LABELS: Record<string, string> = {
  deposit: "Deposit",
  reservation: "Reserved for campaign",
  reservation_release: "Released from campaign",
  media_spend: "Media spend recognised",
  refund_hold: "Refund approved",
  refund_settled: "Refund paid",
  refund_reversed: "Refund failed, returned",
  reconciliation_adjustment: "Reconciliation adjustment",
  gateway_fee: "Gateway charges (borne by AutoSutra)",
};

export default async function WalletPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const actor = await requireOrgActor();
  const orgId = actor.membership.organisationId;
  const db = getDb();
  if ((await fundingMode(db)) !== "central_wallet") {
    return (
      <>
        <PageHeader title="Advertising budgets" />
        <Alert tone="info" title="Your ad platforms bill you directly">
          AutoSutra is currently operating in the dealer-funded model: Meta and Google charge your own ad accounts. AutoSutra records the budgets you approve and the spend the platforms report on each campaign. Centralised budget collection will be offered only after the funding arrangement has completed legal, payment-provider and ad-platform review.
        </Alert>
        <p className="mt-4 text-sm"><Link className="text-road-600 underline" href="/app/reports">See budgets and reported spend in Reports</Link></p>
      </>
    );
  }
  const w = await walletOverview(db, actor, orgId, sp);
  const recon = await orgReconciliationStatus(db, orgId);
  const lines = await entryLines(db, w.entries.map((e) => e.id));
  const signed = (entryId: string) => {
    const rel = lines.filter((l) => l.entryId === entryId && l.code === `org:${orgId}:available`);
    return rel.reduce((s, l) => s + l.credit - l.debit, 0);
  };
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
  return (
    <>
      <PageHeader title="Advertising budget wallet" description="Customer advertising funds held for your campaigns. This is a ledger of funds under AutoSutra's approved funding arrangement, not a payment wallet." />
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total deposits" value={formatINR(w.totalDeposits, { decimals: false })} />
        <Stat label="Available" value={formatINR(w.available, { decimals: false })} hint="Unallocated" tone="ok" />
        <Stat label="Reserved for campaigns" value={formatINR(w.reserved, { decimals: false })} hint="Approved, not yet spent" />
        <Stat label="Spend recognised" value={formatINR(w.recognisedSpend, { decimals: false })} hint="From provider reports" />
        <Stat label="Pending deposits" value={formatINR(w.pendingDeposits, { decimals: false })} hint={`${w.pendingDepositCount} awaiting payment`} />
        <Stat label="Refunds in progress" value={formatINR(w.refundPending, { decimals: false })} />
      </div>
      <p className="mt-2 text-xs text-ink-500">
        Reconciliation: {recon.openDifferences ? `${recon.openDifferences} open difference(s) under review by AutoSutra finance` : "no open differences"} · last run {relativeAge(recon.lastRunAt)}.
        Provider-reported spend can change for a few days as platforms finalise billing.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Transactions"
              actions={<a className="text-sm font-semibold text-road-600" href={`/api/wallet/statement${qs.size ? `?${qs}` : ""}`}>Download CSV statement</a>}
            />
            <form method="get" className="mb-3 flex flex-wrap items-end gap-3 text-sm">
              <label className="flex flex-col gap-1"><span className="text-xs text-ink-600">From</span><input type="date" name="from" defaultValue={sp.from} className="h-9 rounded-md border border-ink-200 px-2" /></label>
              <label className="flex flex-col gap-1"><span className="text-xs text-ink-600">To</span><input type="date" name="to" defaultValue={sp.to} className="h-9 rounded-md border border-ink-200 px-2" /></label>
              <button className="h-9 rounded-md bg-ink-900 px-3 font-semibold text-white">Filter</button>
            </form>
            {w.entries.length === 0 ? (
              <EmptyState title="No transactions in this period" />
            ) : (
              <Table>
                <THead><tr><Th>Date (IST)</Th><Th>Transaction</Th><Th>Type</Th><Th>Description</Th><Th className="text-right">Available balance change</Th></tr></THead>
                <TBody>
                  {w.entries.map((e) => (
                    <tr key={e.id}>
                      <Td className="whitespace-nowrap text-xs">{formatDateTime(e.createdAt)}</Td>
                      <Td className="text-xs"><code>{e.transactionId}</code></Td>
                      <Td className="text-xs">{TYPE_LABELS[e.type] ?? humanize(e.type)}</Td>
                      <Td className="text-xs">{e.memo}{e.paymentReference && <div className="text-ink-500">Ref: {e.paymentReference}</div>}</Td>
                      <Td className={`text-right tabular-nums ${signed(e.id) < 0 ? "text-bad-700" : signed(e.id) > 0 ? "text-ok-700" : "text-ink-400"}`}>{signed(e.id) ? formatINR(signed(e.id)) : "–"}</Td>
                    </tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
          <Card>
            <CardHeader title="Deposits and refunds" />
            <ul className="space-y-1 text-sm">
              {w.deposits.map((d) => <li key={d.id}>{formatDateTime(d.createdAt)}: deposit {formatINR(d.amount)} <StatusBadge status={d.status} /></li>)}
              {w.refunds.map((r) => <li key={r.id}>{formatDateTime(r.createdAt)}: refund {formatINR(r.amount)} <StatusBadge status={r.status} />{r.decisionNote && <span className="text-xs text-ink-500"> ({r.decisionNote})</span>}</li>)}
              {!w.deposits.length && !w.refunds.length && <li className="text-ink-500">None yet.</li>}
            </ul>
          </Card>
        </div>
        <div className="space-y-6">
          {can(actor, orgId, "wallet.deposit") && (
            <Card>
              <CardHeader title="Add funds" description={`From ${formatINR(DEPOSIT_LIMITS.min, { decimals: false })} to ${formatINR(DEPOSIT_LIMITS.max, { decimals: false })} per deposit.`} />
              <ActionForm action={depositAction} showSuccess={false}>
                <input type="hidden" name="requestKey" value={randomUUID()} />
                <TextField label="Amount (₹)" name="amount" inputMode="decimal" required />
                <p className="text-xs text-ink-500">Funds are credited only after the payment gateway confirms the payment to our server. Deposits are used only for campaigns you approve.</p>
                <SubmitButton>Continue to payment</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {can(actor, orgId, "wallet.refund_request") && (
            <Card>
              <CardHeader title="Request a refund" description="Of your available (unallocated) balance. Refunds are reviewed by AutoSutra finance and returned to the original payment method or by bank transfer." />
              <ActionForm action={refundAction} resetOnSuccess>
                <TextField label="Amount (₹)" name="amount" inputMode="decimal" required />
                <TextAreaField label="Reason" name="reason" rows={2} required />
                <SubmitButton variant="secondary">Request refund</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
