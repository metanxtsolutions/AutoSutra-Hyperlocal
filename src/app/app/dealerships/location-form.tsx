import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form";
import { LocationPicker } from "@/components/map/location-picker";
import { LOCATION_KIND_OPTIONS } from "@/lib/catalog";
import { OBJECTIVES } from "@/lib/objectives";
import { rupeesInput } from "@/lib/money";
import { INDIAN_STATES } from "@/server/validation";
import type { ActionState } from "@/server/actions";
import type { locations } from "@/server/db/schema";

type Location = typeof locations.$inferSelect;

export function LocationForm({
  action,
  loc,
  members,
  others,
  submitLabel,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  loc?: Location;
  members: { id: string; name: string }[];
  others: { id: string; name: string; lat: number; lng: number; radiusKm: number }[];
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} showSuccess={false}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Location name" name="name" required defaultValue={loc?.name} hint="e.g. Andheri West Showroom" />
        <SelectField label="Type" name="kind" options={LOCATION_KIND_OPTIONS} defaultValue={loc?.kind ?? "showroom"} />
      </div>
      <TextField label="Address" name="address" required defaultValue={loc?.address} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="City" name="city" required defaultValue={loc?.city} />
        <SelectField label="State / UT" name="state" required options={INDIAN_STATES.map((s) => ({ value: s, label: s }))} placeholder="Choose…" defaultValue={loc?.state} />
        <TextField label="PIN code" name="pincode" required inputMode="numeric" maxLength={6} defaultValue={loc?.pincode} />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink-700">Map pin and default catchment</legend>
        <LocationPicker defaultLat={loc?.latitude} defaultLng={loc?.longitude} defaultRadius={loc?.defaultRadiusKm ?? 5} others={others} />
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextAreaField label="Permitted target PIN codes" name="permittedPincodes" rows={2} defaultValue={loc?.permittedPincodes.join(", ")} hint="Optional. PIN codes campaigns from this location may target." />
        <TextAreaField label="Excluded PIN codes" name="excludedPincodes" rows={2} defaultValue={loc?.excludedPincodes.join(", ")} hint="Optional. Areas this location must never target (e.g. another dealer's territory)." />
        <TextField label="Monthly budget limit (₹)" name="monthlyBudgetLimit" inputMode="decimal" defaultValue={rupeesInput(loc?.monthlyBudgetLimit)} hint="Optional cap on campaign budgets approved per calendar month for this location." />
        <SelectField
          label="Route new leads to"
          name="leadRoutingUserId"
          options={members.map((m) => ({ value: m.id, label: m.name }))}
          placeholder="Unassigned (lead centre queue)"
          defaultValue={loc?.leadRoutingUserId ?? ""}
        />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink-700">Supported campaign types</legend>
        <p className="mb-2 text-xs text-ink-500">Leave all unticked to allow every objective.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {OBJECTIVES.map((o) => (
            <Checkbox key={o.value} name="supportedObjectives" value={o.value} label={o.label} defaultChecked={loc?.supportedObjectives.includes(o.value)} />
          ))}
        </div>
      </fieldset>
      <TextField
        label="Territory overlap override reason"
        name="overlapOverrideReason"
        hint="Only needed if the catchment overlaps another location. Organisation owners and admins can override with a reason, which is recorded in the audit log."
      />
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
