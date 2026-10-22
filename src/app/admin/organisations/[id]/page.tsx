import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Alert, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { SelectField, TextField, TextAreaField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form";
import { ROLE_OPTIONS, labelFor } from "@/lib/catalog";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { hasPlatform } from "@/server/auth/context";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { organisationDetail } from "@/server/services/admin";
import { currentSubscription } from "@/server/services/billing";
import { listAllCampaigns } from "@/server/services/campaigns";
import { managedServiceAction, serviceInvoiceAction, discountAction, suspendOrgAction, verifyOrgAction } from "../../actions";

export const metadata: Metadata = { title: "Organisation" };

export default async function OrgDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const db = getDb();
  const { org, members } = await organisationDetail(db, actor, id);
  const [sub, camps] = await Promise.all([currentSubscription(db, id), listAllCampaigns(db, actor)]);
  const admin = hasPlatform(actor, "platform.admin");
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/organisations" className="hover:underline">Organisations</Link>} title={org.name} actions={<><StatusBadge status={org.verificationStatus} label={`Verification: ${org.verificationStatus}`} /><StatusBadge status={org.status} /></>} />
      {org.suspendedReason && <div className="mb-4"><Alert tone="bad" title="Suspended">{org.suspendedReason}</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Business details" />
            <DescriptionList items={[
              { label: "Legal name", value: org.legalName }, { label: "GSTIN", value: org.gstin }, { label: "PAN", value: org.pan },
              { label: "Billing", value: `${org.billingEmail ?? "–"} · ${org.billingState ?? "–"}` }, { label: "Billing address", value: org.billingAddress },
              { label: "Contact", value: `${org.contactName ?? "–"} ${org.contactPhone ?? ""}` }, { label: "Terms", value: `${org.termsVersion ?? "–"} on ${formatDate(org.termsAcceptedAt)}` },
              { label: "Subscription", value: sub ? `${sub.plan.name} (${sub.sub.status}) until ${formatDate(sub.sub.currentPeriodEnd)}` : "None" },
            ]} />
          </Card>
          <Card>
            <CardHeader title="Members" />
            <ul className="space-y-1 text-sm">{members.map((m) => <li key={m.m.id}>{m.name} &lt;{m.email}&gt; · {labelFor(ROLE_OPTIONS, m.m.role)}</li>)}</ul>
          </Card>
          <Card>
            <CardHeader title="Campaigns" />
            <ul className="space-y-1 text-sm">
              {camps.filter((c) => c.campaign.organisationId === id).map((c) => <li key={c.campaign.id} className="flex justify-between gap-2"><Link className="text-road-600 hover:underline" href={`/admin/campaigns/${c.campaign.id}`}>{c.campaign.name}</Link><span className="flex gap-2"><span className="tabular-nums text-xs">{formatINR(c.budget, { decimals: false })}</span><StatusBadge status={c.campaign.status} /></span></li>)}
            </ul>
          </Card>
        </div>
        <div className="space-y-6">
          {admin && (
            <Card>
              <CardHeader title="Verification" />
              <ActionForm action={verifyOrgAction.bind(null, id)}>
                <SelectField label="Status" name="status" defaultValue={org.verificationStatus === "unverified" ? "pending" : org.verificationStatus} options={[{ value: "pending", label: "Pending" }, { value: "verified", label: "Verified" }, { value: "rejected", label: "Rejected" }]} />
                <TextAreaField label="Note (required for rejection)" name="note" rows={2} defaultValue={org.verificationNote ?? ""} />
                <p className="text-xs text-ink-500">Verify GSTIN and PAN against government records and the authorised signatory before marking verified.</p>
                <SubmitButton size="sm">Save</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {hasPlatform(actor, "platform.campaign_ops") && (
            <Card>
              <CardHeader title="Managed service" description={org.managedServiceRequested ? "Customer has requested managed service." : undefined} />
              <ActionForm action={managedServiceAction.bind(null, id)}>
                <Checkbox name="active" defaultChecked={org.managedServiceActive} label="Managed service active (contract signed)" />
                <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {hasPlatform(actor, "platform.finance") && (
            <Card>
              <CardHeader title="Issue service invoice" description="Management, setup or add-on fees. Billed separately from advertising funds." />
              <ActionForm action={serviceInvoiceAction.bind(null, id)} resetOnSuccess>
                <SelectField label="Type" name="kind" options={[{ value: "management_fee", label: "Campaign management fee" }, { value: "setup_fee", label: "Setup fee" }, { value: "addon", label: "Add-on service" }]} />
                <TextField label="Description" name="description" required />
                <TextField label="Amount before GST (₹)" name="amount" inputMode="decimal" required />
                <SelectField label="Campaign (optional)" name="campaignId" placeholder="None" options={camps.filter((c) => c.campaign.organisationId === id).map((c) => ({ value: c.campaign.id, label: c.campaign.name }))} />
                <SubmitButton size="sm">Issue invoice</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {admin && sub && (
            <Card>
              <CardHeader title="Subscription discount" />
              <ActionForm action={discountAction.bind(null, sub.sub.id)}>
                <TextField label="Discount %" name="percent" inputMode="decimal" defaultValue={String(sub.sub.discountBps / 100)} />
                <TextField label="Reason" name="reason" required />
                <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {admin && (
            <Card>
              <CardHeader title={org.status === "suspended" ? "Reinstate" : "Suspend"} />
              <ActionForm action={suspendOrgAction.bind(null, id, org.status !== "suspended")}>
                <TextAreaField label="Reason (recorded)" name="reason" required rows={2} />
                <SubmitButton size="sm" variant={org.status === "suspended" ? "secondary" : "danger"}>{org.status === "suspended" ? "Reinstate organisation" : "Suspend organisation"}</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
