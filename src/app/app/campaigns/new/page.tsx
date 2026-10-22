import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/fields";
import { LocationMap } from "@/components/map/location-map";
import { OBJECTIVE_DEFS } from "@/lib/objectives";
import { requireOrg } from "@/server/auth/context";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listLocations } from "@/server/services/dealerships";
import { listTemplates } from "@/server/services/campaigns";
import { createCampaignAction } from "../actions";

export const metadata: Metadata = { title: "New campaign" };

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const { template } = await searchParams;
  const actor = await requireOrgActor();
  const orgId = actor.membership.organisationId;
  requireOrg(actor, orgId, "campaign.edit");
  const db = getDb();
  const [locs, templates] = await Promise.all([listLocations(db, actor, orgId), listTemplates(db, actor, orgId)]);
  const active = locs.filter((l) => l.location.status === "active");
  const tpl = templates.find((t) => t.id === template);
  if (!active.length) {
    return (
      <>
        <PageHeader title="New campaign" />
        <EmptyState title="Add a location first" description="Campaigns target the catchment around a dealership location." action={<Link className="text-road-600 underline" href="/app/dealerships">Go to dealerships</Link>} />
      </>
    );
  }
  const groups = ["Sales", "Service", "Brand and events", "Response"] as const;
  return (
    <>
      <PageHeader eyebrow="Step 1 of 9" title="New campaign: choose location and objective" description="You can save and come back to any step. Nothing is published until an approver signs off." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <ActionForm action={createCampaignAction} showSuccess={false}>
            <SelectField
              label="Dealership and location"
              name="location"
              required
              placeholder="Choose…"
              options={active.map((l) => ({ value: `${l.location.dealershipId}:${l.location.id}`, label: `${l.dealershipName}: ${l.location.name} (${l.location.city})` }))}
            />
            <SelectField
              label="Objective"
              name="objective"
              required
              placeholder="Choose…"
              defaultValue={tpl?.objective}
              options={groups.flatMap((g) => OBJECTIVE_DEFS.filter((o) => o.group === g).map((o) => ({ value: o.value, label: `${g}: ${o.label}` })))}
              hint="The next steps show which platforms support your objective."
            />
            <SelectField label="Start from a template" name="templateId" placeholder="No template" defaultValue={tpl?.id} options={templates.map((t) => ({ value: t.id, label: t.name }))} />
            <TextField label="Campaign name" name="name" required defaultValue={tpl ? `${tpl.name}` : ""} hint="For your team; not shown in ads." />
            <SubmitButton>Create draft</SubmitButton>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader title="Your locations" description="Default catchment radius shown for each location." />
          <LocationMap points={active.map((l) => ({ id: l.location.id, name: `${l.dealershipName}: ${l.location.name}`, lat: l.location.latitude, lng: l.location.longitude, radiusKm: l.location.defaultRadiusKm }))} height={320} />
        </Card>
      </div>
    </>
  );
}
