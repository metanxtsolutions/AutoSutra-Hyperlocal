import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form";
import { rupeesInput } from "@/lib/money";
import { requirePlatform } from "@/server/auth/context";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listPlans } from "@/server/services/billing";
import { savePlanAction } from "../actions";
import type { subscriptionPlans } from "@/server/db/schema";

export const metadata: Metadata = { title: "Subscription plans" };

function PlanForm({ p }: { p?: typeof subscriptionPlans.$inferSelect }) {
  return (
    <ActionForm action={savePlanAction.bind(null, p?.id ?? null)}>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Code" name="code" required defaultValue={p?.code} />
        <TextField label="Name" name="name" required defaultValue={p?.name} />
        <TextField label="Price (₹, before GST)" name="price" required defaultValue={rupeesInput(p?.price)} />
        <SelectField label="Interval" name="interval" defaultValue={p?.interval ?? "month"} options={[{ value: "month", label: "Monthly" }, { value: "year", label: "Yearly" }]} />
        <TextField label="Max locations (blank = by contract)" name="maxLocations" defaultValue={p?.maxLocations?.toString() ?? ""} />
        <TextField label="Max users" name="maxUsers" defaultValue={p?.maxUsers?.toString() ?? ""} />
        <TextField label="Max active campaigns" name="maxActiveCampaigns" defaultValue={p?.maxActiveCampaigns?.toString() ?? ""} />
        <TextField label="Trial days" name="trialDays" defaultValue={String(p?.trialDays ?? 14)} />
        <TextField label="GST rate (basis points)" name="gstRateBps" defaultValue={String(p?.gstRateBps ?? 1800)} hint="1800 = 18%" />
        <TextField label="Support level" name="supportLevel" defaultValue={p?.supportLevel ?? "email"} />
        <TextField label="Sort order" name="sortOrder" defaultValue={String(p?.sortOrder ?? 10)} />
      </div>
      <TextField label="Description" name="description" defaultValue={p?.description} />
      <TextAreaField label="Features (one per line)" name="features" rows={4} defaultValue={p?.features.join("\n")} />
      <div className="flex gap-6"><Checkbox name="isPublic" defaultChecked={p?.isPublic ?? true} label="Shown on pricing page" /><Checkbox name="isActive" defaultChecked={p?.isActive ?? true} label="Available for new subscriptions" /></div>
      <SubmitButton size="sm">Save plan</SubmitButton>
    </ActionForm>
  );
}

export default async function PlansPage() {
  const actor = await requireActor();
  requirePlatform(actor, "platform.admin");
  const plans = await listPlans(getDb(), { includeInactive: true });
  return (
    <>
      <PageHeader title="Subscription plans" description="Prices are commercial hypotheses and can change. Existing subscribers keep their price until renewal; changes are audited." />
      <div className="space-y-6">
        {plans.map((p) => <Card key={p.id}><CardHeader title={p.name} description={p.code} /><PlanForm p={p} /></Card>)}
        <Card><CardHeader title="New plan" /><PlanForm /></Card>
      </div>
    </>
  );
}
