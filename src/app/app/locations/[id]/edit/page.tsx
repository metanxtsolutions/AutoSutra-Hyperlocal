import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { requireOrg } from "@/server/auth/context";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getLocation, listLocations } from "@/server/services/dealerships";
import { listTeam } from "@/server/services/organisations";
import { LocationForm } from "../../../dealerships/location-form";
import { updateLocationAction } from "../../../dealerships/actions";

export const metadata: Metadata = { title: "Edit location" };

export default async function EditLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireOrgActor();
  const db = getDb();
  const loc = await getLocation(db, actor, id);
  requireOrg(actor, loc.organisationId, "location.manage");
  const [team, locs] = await Promise.all([listTeam(db, actor, loc.organisationId), listLocations(db, actor, loc.organisationId)]);
  return (
    <>
      <PageHeader eyebrow={<Link href={`/app/dealerships/${loc.dealershipId}`} className="hover:underline">Back to dealership</Link>} title={`Edit ${loc.name}`} />
      <Card className="max-w-4xl">
        <LocationForm
          action={updateLocationAction.bind(null, loc.id, loc.dealershipId)}
          loc={loc}
          members={team.members.map((m) => ({ id: m.user.id, name: m.user.name }))}
          others={locs.filter((l) => l.location.id !== loc.id).map((l) => ({ id: l.location.id, name: l.location.name, lat: l.location.latitude, lng: l.location.longitude, radiusKm: l.location.defaultRadiusKm }))}
          submitLabel="Save location"
        />
      </Card>
    </>
  );
}
