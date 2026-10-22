import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/fields";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { formatINR } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { requirePlatform } from "@/server/auth/context";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { ledgerEntries } from "@/server/db/schema";
import { accountBalances, entryLines, trialBalance } from "@/server/services/ledger";
import { providerPaymentAction, settlementAction } from "../../actions";

export const metadata: Metadata = { title: "Ledger" };

const CATEGORY_ORDER = ["customer_advertising_deposits", "unallocated_balance", "campaign_budget_reservation", "advertising_spend", "refunds", "reconciliation_differences", "operating_receipts", "operating_funds", "accounts_receivable", "subscription_revenue", "management_fee_revenue", "setup_fee_revenue", "addon_revenue", "taxes", "payment_gateway_fees"];

export default async function LedgerPage() {
  const actor = await requireActor();
  requirePlatform(actor, "platform.view_all");
  const db = getDb();
  const [balances, tb, entries] = await Promise.all([accountBalances(db), trialBalance(db), db.select().from(ledgerEntries).orderBy(desc(ledgerEntries.createdAt)).limit(100)]);
  const lines = await entryLines(db, entries.map((e) => e.id));
  const byCategory = CATEGORY_ORDER.map((cat) => ({ cat, total: balances.filter((b) => b.category === cat).reduce((s, b) => s + b.balance, 0), n: balances.filter((b) => b.category === cat).length })).filter((c) => c.n);
  return (
    <>
      <PageHeader title="Advertising-budget ledger" description="Double-entry, append-only. Customer funds (liabilities) are kept apart from AutoSutra revenue." />
      <div className="mb-4">{tb.balanced ? <Alert tone="ok">Trial balance: debits equal credits ({formatINR(tb.debits)}).</Alert> : <Alert tone="bad" title="Trial balance does not balance">Debits {formatINR(tb.debits)} vs credits {formatINR(tb.credits)}. Investigate immediately.</Alert>}</div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Balances by category" />
          <Table>
            <THead><tr><Th>Category</Th><Th className="text-right">Accounts</Th><Th className="text-right">Balance</Th></tr></THead>
            <TBody>{byCategory.map((c) => <tr key={c.cat}><Td>{c.cat.replace(/_/g, " ")}</Td><Td className="text-right">{c.n}</Td><Td className="text-right tabular-nums">{formatINR(c.total)}</Td></tr>)}</TBody>
          </Table>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Record provider payment" description="Paid Meta or Google from the client funds account against recognised spend." />
            <ActionForm action={providerPaymentAction} resetOnSuccess>
              <SelectField label="Provider" name="provider" options={[{ value: "meta", label: "Meta" }, { value: "google", label: "Google" }]} />
              <TextField label="Amount (₹)" name="amount" inputMode="decimal" required />
              <TextField label="Provider invoice / payment reference" name="reference" required />
              <SubmitButton size="sm">Record</SubmitButton>
            </ActionForm>
          </Card>
          <Card>
            <CardHeader title="Record gateway settlement" />
            <ActionForm action={settlementAction} resetOnSuccess>
              <SelectField label="Settled into" name="kind" options={[{ value: "client", label: "Client funds bank account" }, { value: "operating", label: "Operating bank account" }]} />
              <TextField label="Amount (₹)" name="amount" inputMode="decimal" required />
              <TextField label="Settlement reference (UTR)" name="reference" required />
              <SubmitButton size="sm">Record</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
      <Card className="mt-6">
        <CardHeader title="Latest entries" />
        <Table>
          <THead><tr><Th>When</Th><Th>Transaction</Th><Th>Type</Th><Th>Memo</Th><Th>Lines</Th></tr></THead>
          <TBody>
            {entries.map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap text-xs">{formatDateTime(e.createdAt)}</Td>
                <Td className="text-xs"><code>{e.transactionId}</code><div className="text-ink-400">{e.initiatedBySystem ?? "user"}</div></Td>
                <Td className="text-xs">{e.type}</Td>
                <Td className="text-xs">{e.memo}</Td>
                <Td className="text-[11px]">{lines.filter((l) => l.entryId === e.id).map((l, i) => <div key={i}>{l.debit ? `Dr ${formatINR(l.debit)}` : `Cr ${formatINR(l.credit)}`} {l.code}</div>)}</Td>
              </tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
