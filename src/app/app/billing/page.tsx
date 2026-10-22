import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Alert, Card, CardHeader, DescriptionList, EmptyState, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TextAreaField } from "@/components/ui/fields";
import { Modal } from "@/components/ui/modal";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { can, requireOrg } from "@/server/auth/context";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { currentSubscription, listInvoices, listPlans } from "@/server/services/billing";
import { cancelAction, choosePlanAction, payInvoiceAction, resumeAction } from "./actions";

export const metadata: Metadata = { title: "Subscription & billing" };

export default async function BillingPage() {
  const actor = await requireOrgActor();
  const orgId = actor.membership.organisationId;
  requireOrg(actor, orgId, "billing.view");
  const db = getDb();
  const [cur, plans, invs] = await Promise.all([currentSubscription(db, orgId), listPlans(db), listInvoices(db, actor, orgId)]);
  const manage = can(actor, orgId, "billing.manage");
  return (
    <>
      <PageHeader title="Subscription & billing" description="AutoSutra software fees and service invoices. Advertising spend is billed separately and never appears here." />
      {cur?.sub.status === "past_due" && <div className="mb-4"><Alert tone="bad" title="Payment overdue">Please pay your outstanding invoice to keep your subscription active.</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Current plan" actions={cur && <StatusBadge status={cur.sub.status} />} />
          {cur ? (
            <>
              <DescriptionList
                items={[
                  { label: "Plan", value: cur.plan.name },
                  { label: "Price", value: `${formatINR(cur.sub.priceAtSignup, { decimals: false })} / ${cur.plan.interval} + GST${cur.sub.discountBps ? ` (discount ${cur.sub.discountBps / 100}%)` : ""}` },
                  { label: cur.sub.status === "trialing" ? "Trial ends" : "Current period ends", value: formatDate(cur.sub.currentPeriodEnd) },
                  { label: "Locations included", value: cur.plan.maxLocations ?? "By contract" },
                ]}
              />
              {cur.sub.cancelAtPeriodEnd && <div className="mt-3"><Alert tone="warn">Cancels on {formatDate(cur.sub.currentPeriodEnd)}.</Alert></div>}
              {manage && (
                <div className="mt-4">
                  {cur.sub.cancelAtPeriodEnd ? (
                    <ActionForm action={resumeAction}><SubmitButton variant="secondary" size="sm">Keep my subscription</SubmitButton></ActionForm>
                  ) : (
                    <Modal trigger="Cancel subscription" title="Cancel subscription" triggerVariant="ghost">
                      <ActionForm action={cancelAction}>
                        <p className="text-sm">Your subscription stays active until {formatDate(cur.sub.currentPeriodEnd)}. Campaign history and reports remain available for export.</p>
                        <TextAreaField label="Why are you cancelling?" name="reason" required rows={2} />
                        <SubmitButton variant="danger">Cancel at period end</SubmitButton>
                      </ActionForm>
                    </Modal>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-ink-600">No subscription yet. Choose a plan to start your trial.</p>
          )}
        </Card>
        <div className="lg:col-span-2">
          <div className="grid gap-4 md:grid-cols-3">
            {plans.filter((p) => p.isPublic).map((p) => (
              <div key={p.id} className={`flex flex-col rounded-xl border bg-white p-4 shadow-sm ${cur?.plan.id === p.id ? "border-brand-500 ring-2 ring-brand-100" : "border-ink-200"}`}>
                <div className="font-semibold">{p.name}</div>
                <div className="mt-1 text-xl font-bold tabular-nums">{formatINR(p.price, { decimals: false })}<span className="text-xs font-normal text-ink-500"> /{p.interval} + GST</span></div>
                <ul className="mt-2 flex-1 space-y-1 text-xs text-ink-600">{p.features.map((f) => <li key={f}>✓ {f}</li>)}</ul>
                {manage && cur?.plan.id !== p.id && (
                  <ActionForm action={choosePlanAction.bind(null, p.id)} className="mt-3">
                    <SubmitButton size="sm" variant={cur ? "secondary" : "primary"}>{!cur ? (p.trialDays ? `Start ${p.trialDays}-day trial` : "Subscribe") : p.price > cur.plan.price ? "Upgrade now" : "Switch at renewal"}</SubmitButton>
                  </ActionForm>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-500">Upgrades take effect immediately and are invoiced for a full period from today. Downgrades take effect at renewal.</p>
        </div>
      </div>
      <div className="mt-8">
        <CardHeader title="Invoices" />
        {invs.length === 0 ? (
          <EmptyState title="No invoices yet" />
        ) : (
          <Table>
            <THead><tr><Th>Invoice</Th><Th>Type</Th><Th>Issued</Th><Th>Due</Th><Th className="text-right">Total</Th><Th>Status</Th><Th></Th></tr></THead>
            <TBody>
              {invs.map((i) => (
                <tr key={i.id}>
                  <Td><Link href={`/app/billing/invoices/${i.id}`} className="font-medium text-road-600 hover:underline">{i.number}</Link></Td>
                  <Td>{i.kind.replace("_", " ")}</Td>
                  <Td>{formatDate(i.issuedAt)}</Td>
                  <Td>{formatDate(i.dueAt)}</Td>
                  <Td className="text-right tabular-nums">{formatINR(i.total)}</Td>
                  <Td><StatusBadge status={i.status} /></Td>
                  <Td>{manage && i.status === "issued" && <ActionForm action={payInvoiceAction.bind(null, i.id)} showSuccess={false}><SubmitButton size="sm">Pay</SubmitButton></ActionForm>}</Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </>
  );
}
