import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { TextAreaField, TextField } from "@/components/ui/fields";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { LocationMap } from "@/components/map/location-map";
import { RADIUS_DISCLAIMER } from "@/lib/geo";
import type { Actor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import type { FullCampaign } from "@/server/services/campaigns";
import { listLocations } from "@/server/services/dealerships";
import { targetingAction } from "../../actions";

const LANGUAGES = [
  ["en", "English"], ["hi", "Hindi"], ["mr", "Marathi"], ["ta", "Tamil"], ["te", "Telugu"],
  ["kn", "Kannada"], ["ml", "Malayalam"], ["bn", "Bengali"], ["gu", "Gujarati"], ["pa", "Punjabi"],
] as const;

export async function TargetingStep({ full, actor }: { full: FullCampaign; actor: Actor }) {
  const c = full.campaign;
  const locs = (await listLocations(getDb(), actor, c.organisationId, c.dealershipId)).filter((l) => l.location.status === "active");
  const targeted = new Map(full.targets.map((t) => [t.location.id, t.targeting]));
  const hasGoogle = full.platforms.some((p) => p.platform.provider === "google");
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <ActionForm action={targetingAction.bind(null, c.id)} showSuccess={false}>
          <CardHeader title="Geographic targeting" description="Step 5. The primary location is always included." />
          <div className="space-y-4">
            {locs.map(({ location: l }) => {
              const t = targeted.get(l.id);
              const primary = l.id === c.primaryLocationId;
              return (
                <fieldset key={l.id} className="rounded-lg border border-ink-200 p-3">
                  <legend className="px-1 text-sm font-semibold">{l.name}{primary && " (primary)"}</legend>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="sm:col-span-1">
                      {primary ? (
                        <input type="hidden" name="locationIds" value={l.id} />
                      ) : (
                        <Checkbox name="locationIds" value={l.id} defaultChecked={!!t} label="Target" />
                      )}
                      <label className="mt-2 block text-xs font-medium text-ink-600" htmlFor={`radius_${l.id}`}>Radius (km)</label>
                      <Input id={`radius_${l.id}`} name={`radius_${l.id}`} type="number" min={1} max={80} defaultValue={t?.radiusKm ?? l.defaultRadiusKm} list="radius-presets" />
                    </div>
                    <div className="sm:col-span-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-medium text-ink-600">
                        Also include PIN codes
                        <textarea name={`include_${l.id}`} rows={2} defaultValue={t?.includePincodes.join(", ")} className="mt-1 block w-full rounded-md border border-ink-200 px-2 py-1 text-sm" />
                        {l.permittedPincodes.length > 0 && <span className="text-[11px] font-normal text-ink-500">Permitted: {l.permittedPincodes.join(", ")}</span>}
                      </label>
                      <label className="text-xs font-medium text-ink-600">
                        Exclude PIN codes (Meta)
                        <textarea name={`exclude_${l.id}`} rows={2} defaultValue={t?.excludePincodes.join(", ")} className="mt-1 block w-full rounded-md border border-ink-200 px-2 py-1 text-sm" />
                        {l.excludedPincodes.length > 0 && <span className="text-[11px] font-normal text-ink-500">Always excluded: {l.excludedPincodes.join(", ")}</span>}
                      </label>
                    </div>
                  </div>
                </fieldset>
              );
            })}
            <datalist id="radius-presets">{[1, 3, 5, 10, 15, 25].map((r) => <option key={r} value={r} />)}</datalist>
          </div>
          <CardHeader title="Audience and placements" description="Step 6. Only location, age and language are used. No sensitive or personal attributes." />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="Minimum age" name="ageMin" type="number" min={18} max={65} defaultValue={String(c.ageMin)} />
            <TextField label="Maximum age" name="ageMax" type="number" min={18} max={65} defaultValue={String(c.ageMax)} />
            <div>
              <label className="mb-1 block text-sm font-medium text-ink-800" htmlFor="placements">Placements (Meta)</label>
              <Select name="placements" defaultValue={c.placements} options={[{ value: "automatic", label: "Automatic (recommended)" }, { value: "facebook_only", label: "Facebook only" }, { value: "instagram_only", label: "Instagram only" }]} />
            </div>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink-800">Languages</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {LANGUAGES.map(([v, l]) => <Checkbox key={v} name="languages" value={v} label={l} defaultChecked={c.languages.includes(v)} />)}
            </div>
          </fieldset>
          {hasGoogle && (
            <TextAreaField label="Search keywords (Google)" name="keywords" rows={4} defaultValue={c.keywords.join("\n")} hint="One per line, at least 3. Used as phrase-match keywords, e.g. nexon test drive andheri." />
          )}
          {!hasGoogle && <input type="hidden" name="keywords" value={c.keywords.join("\n")} />}
          <TextField label="Territory overlap override reason" name="overlapOverrideReason" hint="Only needed if a radius overlaps another dealer's territory. Organisation owners and admins can override with a recorded reason." />
          <SubmitButton>Save and continue</SubmitButton>
        </ActionForm>
      </Card>
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader title="Target area preview" />
          <LocationMap points={full.targets.map((t) => ({ id: t.location.id, name: t.location.name, lat: t.location.latitude, lng: t.location.longitude, radiusKm: t.targeting.radiusKm }))} height={300} />
        </Card>
        <Alert tone="warn" title="About radius targeting">{RADIUS_DISCLAIMER}</Alert>
        <Alert tone="info">Remarketing audiences are not offered yet. They need consented customer data and are planned for a later release.</Alert>
      </div>
    </div>
  );
}
