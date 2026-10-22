import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form";
import { VEHICLE_CATEGORY_OPTIONS } from "@/lib/catalog";
import { OBJECTIVE_DEFS, objectiveDef } from "@/lib/objectives";
import { rupeesInput } from "@/lib/money";
import type { FullCampaign } from "@/server/services/campaigns";
import { productAction } from "../../actions";

export function ProductStep({ full }: { full: FullCampaign }) {
  const c = full.campaign;
  const def = objectiveDef(c.objective);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <ActionForm action={productAction.bind(null, c.id)} showSuccess={false}>
          <CardHeader title="Objective" description="Step 2" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Campaign name" name="name" required defaultValue={c.name} />
            <SelectField label="Objective" name="objective" defaultValue={c.objective} options={OBJECTIVE_DEFS.map((o) => ({ value: o.value, label: `${o.group}: ${o.label}` }))} />
          </div>
          <CardHeader title="Vehicle, service or offer" description="Step 3. Never enter prices, finance rates or offers that have not been confirmed." />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="Brand" name="brand" defaultValue={c.brand ?? ""} />
            <TextField label="Model" name="model" defaultValue={c.model ?? ""} />
            <TextField label="Variant" name="variant" defaultValue={c.variant ?? ""} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Vehicle category" name="vehicleCategory" placeholder="Not specified" defaultValue={c.vehicleCategory ?? ""} options={VEHICLE_CATEGORY_OPTIONS} />
            <TextField label="Booking or test-drive URL" name="bookingUrl" type="url" placeholder="https://" defaultValue={c.bookingUrl ?? ""} />
            <TextField label="Offer headline" name="offerHeadline" defaultValue={c.offerHeadline ?? ""} hint="e.g. Exchange bonus available. Leave blank if there is no offer." />
            <TextField label="Starting price (₹)" name="startingPrice" inputMode="decimal" defaultValue={rupeesInput(c.startingPrice)} hint="Only a price you have verified." />
          </div>
          <TextAreaField label="Offer details" name="offerDetails" rows={3} defaultValue={c.offerDetails ?? ""} />
          <TextAreaField label="Finance or EMI details" name="financeDetails" rows={2} defaultValue={c.financeDetails ?? ""} hint="Only terms approved by the lending partner." />
          <div className="space-y-2">
            <Checkbox name="priceVerified" defaultChecked={c.priceVerified} label="The starting price has been verified against the current price list." />
            <Checkbox name="financeApproved" defaultChecked={c.financeApproved} label="The finance or EMI terms have been approved by the lender." />
          </div>
          <TextAreaField label="Campaign disclaimer" name="disclaimer" rows={2} defaultValue={c.disclaimer ?? ""} hint="Required when the campaign mentions prices, finance or offers. e.g. Terms and conditions apply. Offer valid till stocks last." />
          <SubmitButton>Save and continue</SubmitButton>
        </ActionForm>
      </Card>
      <div className="space-y-4">
        {def && (
          <Card>
            <CardHeader title={def.label} description={def.description} />
            <dl className="space-y-3 text-sm">
              {(["meta", "google"] as const).map((p) => (
                <div key={p}>
                  <dt className="font-semibold">{p === "meta" ? "Meta Ads" : "Google Ads"}: {def[p].supported ? "Supported" : "Not supported yet"}</dt>
                  <dd className="text-ink-600">{def[p].note}</dd>
                  {def[p].supported && <dd className="text-xs text-ink-500">Formats: {def[p].formats.join("; ")}</dd>}
                </div>
              ))}
            </dl>
          </Card>
        )}
        <Alert tone="info" title="Claim approval">
          Prices, finance terms and offers are promotional claims. The approver confirms them before the campaign can be published, and any later change needs confirming again.
        </Alert>
        <Alert tone="warn">Do not use manufacturer logos, product images or campaign claims unless your OEM agreement authorises it.</Alert>
      </div>
    </div>
  );
}
