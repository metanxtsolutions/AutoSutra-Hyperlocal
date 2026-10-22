import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { requireOrg } from "@/server/auth/context";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getDealership, listLocations } from "@/server/services/dealerships";
import { listTeam } from "@/server/services/organisations";
import { LocationForm } from "../../../location-form";
import { createLocationAction } from "../../../actions";

export const metadata: Metadata = { title: "Add location" };

export default async function NewLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireOrgActor();
  const db = getDb();
  const d = await getDealership(db, actor, id);
  requireOrg(actor, d.organisationId, "location.manage");
  const [team, locs] = await Promise.all([listTeam(db, actor, d.organisationId), listLocations(db, actor, d.organisationId)]);
  return (
    <>
      <PageHeader eyebrow={<Link href={`/app/dealerships/${d.id}`} className="hover:underline">{d.name}</Link>} title="Add location" />
      <Card className="max-w-4xl">
        <LocationForm
          action={createLocationAction.bind(null, d.id)}
          members={team.members.map((m) => ({ id: m.user.id, name: m.user.name }))}
          others={locs.map((l) => ({ id: l.location.id, name: l.location.name, lat: l.location.latitude, lng: l.location.longitude, radiusKm: l.location.defaultRadiusKm }))}
          submitLabel="Add location"
        />
      </Card>
    </>
  );
}
