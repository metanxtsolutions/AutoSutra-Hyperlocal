import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { SelectField, TextField } from "@/components/ui/fields";
import { DEALERSHIP_TYPE_OPTIONS, VEHICLE_CATEGORY_OPTIONS } from "@/lib/catalog";
import { INDIAN_STATES } from "@/server/validation";
import type { ActionState } from "@/server/actions";
import type { dealerships } from "@/server/db/schema";

type Dealership = typeof dealerships.$inferSelect;

export function DealershipForm({ action, d, submitLabel }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; d?: Dealership; submitLabel: string }) {
  return (
    <ActionForm action={action} showSuccess={false}>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-700">Dealership</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Dealership name" name="name" required defaultValue={d?.name} />
          <TextField label="Brands represented" name="brands" required defaultValue={d?.brands.join(", ")} hint="Comma separated, e.g. Tata, Tata EV" />
          <SelectField label="Vehicle category" name="vehicleCategory" required options={VEHICLE_CATEGORY_OPTIONS} placeholder="Choose…" defaultValue={d?.vehicleCategory} />
          <SelectField label="Dealership type" name="dealershipType" required options={DEALERSHIP_TYPE_OPTIONS} placeholder="Choose…" defaultValue={d?.dealershipType} />
          <TextField label="GSTIN" name="gstin" defaultValue={d?.gstin ?? ""} hint="Optional. Used for business verification." />
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-700">Business address</legend>
        <TextField label="Address" name="address" required defaultValue={d?.address} />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="City" name="city" required defaultValue={d?.city} />
          <SelectField label="State / UT" name="state" required options={INDIAN_STATES.map((s) => ({ value: s, label: s }))} placeholder="Choose…" defaultValue={d?.state} />
          <TextField label="PIN code" name="pincode" required inputMode="numeric" maxLength={6} defaultValue={d?.pincode} />
          <TextField label="Latitude" name="latitude" inputMode="decimal" defaultValue={d?.latitude?.toString() ?? ""} hint="Optional" />
          <TextField label="Longitude" name="longitude" inputMode="decimal" defaultValue={d?.longitude?.toString() ?? ""} hint="Optional" />
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-ink-700">Contact</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Contact person" name="contactName" defaultValue={d?.contactName ?? ""} />
          <TextField label="Contact phone" name="contactPhone" type="tel" defaultValue={d?.contactPhone ?? ""} />
          <TextField label="Business email" name="businessEmail" type="email" defaultValue={d?.businessEmail ?? ""} />
          <TextField label="Website" name="website" type="url" placeholder="https://" defaultValue={d?.website ?? ""} />
          <TextField label="Google Business Profile URL" name="googleBusinessProfileUrl" type="url" placeholder="https://" defaultValue={d?.googleBusinessProfileUrl ?? ""} />
        </div>
      </fieldset>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
