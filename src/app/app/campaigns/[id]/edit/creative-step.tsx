import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form";
import { CALL_TO_ACTIONS, CREATIVE_LIMITS } from "@/lib/objectives";
import type { Actor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { listAssets, type FullCampaign } from "@/server/services/campaigns";
import { creativeAction, uploadAssetAction } from "../../actions";
import { AdPreview } from "../ad-preview";

export async function CreativeStep({ full, actor }: { full: FullCampaign; actor: Actor }) {
  const c = full.campaign;
  const cr = full.creative;
  const assets = await listAssets(getDb(), actor, c.organisationId);
  const hasMeta = full.platforms.some((p) => p.platform.provider === "meta");
  const hasGoogle = full.platforms.some((p) => p.platform.provider === "google");
  const G = CREATIVE_LIMITS.google;
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        <Card>
          <ActionForm action={creativeAction.bind(null, c.id)} showSuccess={false}>
            <CardHeader title="Ad copy" description="Fill in every {placeholder} from the template." />
            {hasMeta && (
              <fieldset className="space-y-4">
                <legend className="text-sm font-semibold text-ink-700">Meta</legend>
                <TextField label="Headline" name="headline" defaultValue={cr?.headline ?? ""} hint={`Up to ${CREATIVE_LIMITS.meta.headline} characters recommended.`} />
                <TextAreaField label="Primary text" name="primaryText" rows={4} defaultValue={cr?.primaryText ?? ""} hint={`Up to ${CREATIVE_LIMITS.meta.primaryText} characters.`} />
                <TextField label="Link description" name="description" defaultValue={cr?.description ?? ""} />
                <TextField label="Meta instant form id (optional)" name="metaLeadFormId" defaultValue={cr?.metaLeadFormId ?? ""} hint="Set to use an instant form instead of your landing page. Create the form in Meta Business Suite first." />
              </fieldset>
            )}
            {hasGoogle && (
              <fieldset className="space-y-4">
                <legend className="text-sm font-semibold text-ink-700">Google responsive search ad</legend>
                <TextAreaField label={`Headlines (${G.minHeadlines} to ${G.maxHeadlines}, one per line)`} name="headlines" rows={5} defaultValue={cr?.headlines.join("\n")} hint={`Each up to ${G.headline} characters.`} />
                <TextAreaField label={`Descriptions (${G.minDescriptions} to ${G.maxDescriptions}, one per line)`} name="descriptions" rows={3} defaultValue={cr?.descriptions.join("\n")} hint={`Each up to ${G.description} characters.`} />
              </fieldset>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Call to action" name="callToAction" defaultValue={cr?.callToAction ?? "LEARN_MORE"} options={CALL_TO_ACTIONS} />
              <TextField label="Landing page URL" name="landingUrl" type="url" placeholder="https://" defaultValue={cr?.landingUrl ?? ""} />
              <TextField label="Phone number shown on landing page" name="phoneNumber" type="tel" defaultValue={cr?.phoneNumber ?? ""} hint="Optional. Recorded for lead attribution." />
              <TextField label="WhatsApp number" name="whatsappNumber" type="tel" defaultValue={cr?.whatsappNumber ?? ""} hint="Optional. Click-to-WhatsApp ads are not supported yet." />
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink-700">Images and videos</legend>
              {assets.length === 0 ? (
                <p className="text-sm text-ink-500">No media uploaded yet. Upload below.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {assets.map((a) => (
                    <label key={a.id} className="block rounded-lg border border-ink-200 p-2 text-xs has-[:checked]:border-road-500 has-[:checked]:ring-2 has-[:checked]:ring-road-100">
                      {a.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/assets/${a.id}`} alt={a.filename} className="mb-1 aspect-square w-full rounded object-cover" />
                      ) : (
                        <div className="mb-1 flex aspect-square items-center justify-center rounded bg-ink-100">Video</div>
                      )}
                      <span className="flex items-center gap-1">
                        <input type="checkbox" name="assetIds" value={a.id} defaultChecked={cr?.assetIds.includes(a.id)} />
                        <span className="truncate">{a.filename}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <SubmitButton>Save creative</SubmitButton>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader title="Upload media" description="JPEG, PNG or WebP up to 8 MB (at least 600 × 600 px), or MP4 up to 25 MB." />
          <ActionForm action={uploadAssetAction} resetOnSuccess>
            <input type="file" name="file" accept="image/jpeg,image/png,image/webp,video/mp4" required className="block text-sm" />
            <Checkbox name="licenceConfirmed" label="I confirm we own this media or are licensed to use it in ads, including any manufacturer logos, vehicle images or people shown." />
            <TextField label="Licence or source note" name="licenceNote" hint="e.g. Shot by our team on 12 Oct; OEM asset pack ref ABC." />
            <SubmitButton variant="secondary">Upload</SubmitButton>
          </ActionForm>
        </Card>
      </div>
      <div className="space-y-4 lg:col-span-2">
        <AdPreview full={full} />
        <Alert tone="info">Previews are approximate. Each platform renders ads differently by placement and device.</Alert>
      </div>
    </div>
  );
}
