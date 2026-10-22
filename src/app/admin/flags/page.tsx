import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SelectField, TextField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form";
import { formatDateTime } from "@/lib/format";
import { requirePlatform } from "@/server/auth/context";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { allFlags, getSetting } from "@/server/flags";
import { INDIAN_STATES } from "@/server/validation";
import { flagAction, settingsAction } from "../actions";

export const metadata: Metadata = { title: "Feature flags & funding" };

export default async function FlagsPage() {
  const actor = await requireActor();
  requirePlatform(actor, "platform.admin");
  const db = getDb();
  const [flags, supplierState, supplier, retention] = await Promise.all([
    allFlags(db),
    getSetting(db, "supplier_state", "Maharashtra"),
    getSetting(db, "supplier_details", { name: "", address: "", gstin: "" }),
    getSetting(db, "lead_retention_days", 730),
  ]);
  return (
    <>
      <PageHeader title="Feature flags and funding model" description="Every change requires a reason and typed confirmation, and is audited." />
      <div className="mb-6">
        <Alert tone="warn" title="Before enabling central_wallet or live_deposit_collection">
          Confirm in writing: (1) legal advice on holding and allocating customer advertising funds in India, including whether the arrangement is a regulated payment activity; (2) the payment gateway&apos;s approval of the use case and settlement into a designated client-funds account; (3) Meta and Google terms for billing customer ad accounts from AutoSutra funds; (4) GST treatment from your tax adviser. Until then keep the dealer-funded model, where customers pay the ad platforms directly.
        </Alert>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {flags.map((f) => (
          <Card key={f.key}>
            <CardHeader title={f.key} description={f.description} actions={f.enabled ? <Badge tone="warn">On</Badge> : <Badge>Off</Badge>} />
            <ActionForm action={flagAction.bind(null, f.key)}>
              <Checkbox name="enabled" defaultChecked={f.enabled} label="Enabled" />
              <TextField label="Reason (recorded)" name="reason" required />
              <TextField label={`Type ${f.key} to confirm`} name="confirm" required />
              <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
            </ActionForm>
            <p className="mt-2 text-xs text-ink-500">Last changed {formatDateTime(f.updatedAt)}</p>
          </Card>
        ))}
        <Card>
          <CardHeader title="Invoicing and data settings" />
          <ActionForm action={settingsAction}>
            <TextField label="Supplier legal name" name="supplierName" defaultValue={supplier.name} required />
            <TextField label="Supplier registered address" name="supplierAddress" defaultValue={supplier.address} required />
            <TextField label="Supplier GSTIN" name="supplierGstin" defaultValue={supplier.gstin} required />
            <SelectField label="Supplier state (for CGST/SGST vs IGST)" name="supplierState" defaultValue={supplierState} options={INDIAN_STATES.map((s) => ({ value: s, label: s }))} />
            <TextField label="Lead data retention (days)" name="leadRetentionDays" defaultValue={String(retention)} hint="Leads older than this are anonymised automatically." />
            <SubmitButton size="sm">Save settings</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
