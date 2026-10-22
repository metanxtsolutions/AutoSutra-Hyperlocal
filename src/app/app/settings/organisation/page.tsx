import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/badge";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form";
import { ORG_TYPE_OPTIONS, labelFor } from "@/lib/catalog";
import { requireOrg } from "@/server/auth/context";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getOrganisation } from "@/server/services/organisations";
import { INDIAN_STATES } from "@/server/validation";
import { businessDetailsAction, managedServiceAction } from "./actions";

export const metadata: Metadata = { title: "Organisation settings" };

export default async function OrganisationSettingsPage() {
  const actor = await requireOrgActor();
  const orgId = actor.membership.organisationId;
  requireOrg(actor, orgId, "org.manage");
  const org = await getOrganisation(getDb(), actor, orgId);
  return (
    <>
      <PageHeader title="Organisation" description={`${org.name} · ${labelFor(ORG_TYPE_OPTIONS, org.type)}`} actions={<StatusBadge status={org.verificationStatus} label={`Verification: ${org.verificationStatus}`} />} />
      {org.verificationStatus === "rejected" && org.verificationNote && (
        <div className="mb-4"><Alert tone="bad" title="Verification was not approved">{org.verificationNote}</Alert></div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Business and billing details" description="Used for verification and on your invoices. GST is charged based on your billing state." />
          <ActionForm action={businessDetailsAction}>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Registered business name" name="legalName" required defaultValue={org.legalName ?? ""} />
              <TextField label="GSTIN" name="gstin" defaultValue={org.gstin ?? ""} hint="Optional, but needed for GST input credit on invoices." />
              <TextField label="PAN" name="pan" defaultValue={org.pan ?? ""} />
              <TextField label="Billing email" name="billingEmail" type="email" required defaultValue={org.billingEmail ?? ""} />
              <TextField label="Contact person" name="contactName" required defaultValue={org.contactName ?? ""} />
              <TextField label="Contact phone" name="contactPhone" type="tel" defaultValue={org.contactPhone ?? ""} />
              <SelectField label="Billing state / UT" name="billingState" required options={INDIAN_STATES.map((s) => ({ value: s, label: s }))} placeholder="Choose…" defaultValue={org.billingState ?? ""} />
            </div>
            <TextField label="Billing address" name="billingAddress" required defaultValue={org.billingAddress ?? ""} />
            <SubmitButton>Save details</SubmitButton>
          </ActionForm>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Managed advertising" description="Ask AutoSutra's campaign team to build and run campaigns for you. You still approve every campaign and budget." />
            <ActionForm action={managedServiceAction}>
              <Checkbox name="requested" defaultChecked={org.managedServiceRequested} label="Request managed campaign service" />
              {org.managedServiceActive && <Alert tone="ok">Managed service is active for this organisation.</Alert>}
              <SubmitButton variant="secondary">Save</SubmitButton>
            </ActionForm>
          </Card>
          <Card>
            <CardHeader title="Terms" />
            <p className="text-sm text-ink-600">Accepted version {org.termsVersion ?? "–"} on {org.termsAcceptedAt?.toLocaleDateString("en-IN") ?? "–"}.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
