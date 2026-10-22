import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/form";
import { objectiveDef } from "@/lib/objectives";
import type { Actor } from "@/server/auth/context";
import { getDb } from "@/server/db/client";
import { effectiveMode, MODE_LABELS } from "@/server/providers/modes";
import type { FullCampaign } from "@/server/services/campaigns";
import { listProviderAccounts } from "@/server/services/connections";
import { platformsAction } from "../../actions";

export async function PlatformsStep({ full, actor }: { full: FullCampaign; actor: Actor }) {
  const db = getDb();
  const c = full.campaign;
  const def = objectiveDef(c.objective)!;
  const [accounts, metaMode, googleMode] = await Promise.all([
    listProviderAccounts(db, actor, c.organisationId),
    effectiveMode(db, "meta"),
    effectiveMode(db, "google"),
  ]);
  const modes = { meta: metaMode, google: googleMode };
  const selected = new Set(full.platforms.map((p) => p.platform.provider));
  return (
    <Card className="max-w-4xl">
      <CardHeader title="Advertising platforms" description="Each platform is set up with the campaign type it actually supports for this objective." />
      <ActionForm action={platformsAction.bind(null, c.id)} showSuccess={false}>
        <div className="grid gap-4 md:grid-cols-2">
          {(["meta", "google"] as const).map((p) => {
            const m = def[p];
            const mode = modes[p];
            const accts = accounts.filter((a) => a.provider === p);
            const current = full.platforms.find((x) => x.platform.provider === p)?.platform.providerAccountId ?? accts.find((a) => a.selected)?.id ?? "";
            return (
              <fieldset key={p} className={`rounded-lg border p-4 ${m.supported ? "border-ink-200" : "border-dashed border-ink-200 bg-ink-50"}`}>
                <legend className="px-1 text-sm font-semibold">{p === "meta" ? "Meta Ads (Facebook and Instagram)" : "Google Ads"}</legend>
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge tone={mode === "live" ? "ok" : mode === "demo" ? "demo" : mode === "pending" ? "warn" : "neutral"}>{MODE_LABELS[mode]}</Badge>
                  {m.supported ? <Badge tone="info">{m.campaignType}</Badge> : <Badge tone="bad">Not supported for this objective</Badge>}
                </div>
                <p className="text-sm text-ink-600">{m.note}</p>
                {m.supported && (
                  <>
                    <p className="mt-2 text-xs text-ink-500">Formats: {m.formats.join("; ")}</p>
                    <label className="mt-3 flex items-center gap-2 text-sm font-medium">
                      <input type="checkbox" name="providers" value={p} defaultChecked={selected.has(p)} className="h-4 w-4" /> Use {p === "meta" ? "Meta Ads" : "Google Ads"}
                    </label>
                    <div className="mt-3">
                      <label className="text-xs font-medium text-ink-600" htmlFor={`${p}AccountId`}>Ad account</label>
                      {accts.length ? (
                        <Select name={`${p}AccountId`} defaultValue={current} placeholder="Choose later" options={accts.map((a) => ({ value: a.id, label: `${a.name} (${a.externalId})` }))} />
                      ) : (
                        <p className="text-xs text-ink-500">
                          No {p === "meta" ? "Meta" : "Google Ads"} account connected. {mode === "demo" ? "Not needed in demo mode." : <Link href="/app/settings/connections" className="text-road-600 underline">Connect one</Link>}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </fieldset>
            );
          })}
        </div>
        {(metaMode === "demo" || googleMode === "demo") && (
          <Alert tone="info" title="Demo mode">Platforms in demo mode simulate publishing. Nothing is sent to the provider and no performance data is reported.</Alert>
        )}
        <SubmitButton>Save and continue</SubmitButton>
      </ActionForm>
    </Card>
  );
}
