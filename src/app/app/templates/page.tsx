import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Alert, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CALL_TO_ACTIONS, objectiveDef } from "@/lib/objectives";
import { can } from "@/server/auth/context";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listTemplates } from "@/server/services/campaigns";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const actor = await requireOrgActor();
  const orgId = actor.membership.organisationId;
  const templates = await listTemplates(getDb(), actor, orgId);
  const canCreate = can(actor, orgId, "campaign.edit");
  return (
    <>
      <PageHeader title="Automotive templates" description="Starting points for common dealership campaigns. Placeholders in braces are filled from your dealership and campaign details; you supply models, offers and prices yourself." />
      <div className="mb-6"><Alert tone="info">Templates never contain prices, finance rates, offers, delivery dates or specifications. Add only details you have verified.</Alert></div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => (
          <article key={t.id} className="flex flex-col rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap gap-2">
              <Badge tone="brand">{t.category.replace(/_/g, " ")}</Badge>
              <Badge>{objectiveDef(t.objective)?.label}</Badge>
              {t.organisationId && <Badge tone="info">Your template</Badge>}
            </div>
            <h2 className="mt-3 font-semibold">{t.name}</h2>
            <div className="mt-2 flex-1 rounded-lg bg-ink-50 p-3 text-sm">
              <div className="font-semibold">{t.headline}</div>
              <p className="mt-1 text-ink-700">{t.primaryText}</p>
              <div className="mt-2 text-xs text-ink-500">CTA: {CALL_TO_ACTIONS.find((c) => c.value === t.callToAction)?.label}</div>
            </div>
            <p className="mt-2 text-xs text-ink-500">Placeholders: {t.placeholders.map((p) => `{${p}}`).join(", ")}</p>
            {canCreate && <ButtonLink href={`/app/campaigns/new?template=${t.id}`} variant="secondary" className="mt-4">Use template</ButtonLink>}
          </article>
        ))}
      </div>
    </>
  );
}
