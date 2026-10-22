import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { LocationMap } from "@/components/map/location-map";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listLocations } from "@/server/services/dealerships";

export const metadata: Metadata = { title: "Locations map" };

export default async function LocationsPage() {
  const actor = await requireOrgActor();
  const locs = await listLocations(getDb(), actor, actor.membership.organisationId);
  return (
    <>
      <PageHeader title="Locations map" description="All locations you can access, with their default catchment radius." />
      {locs.length === 0 ? (
        <EmptyState title="No locations yet" description="Add locations from a dealership page." action={<Link className="text-road-600 underline" href="/app/dealerships">Go to dealerships</Link>} />
      ) : (
        <>
          <Card>
            <LocationMap height={460} points={locs.map((l) => ({ id: l.location.id, name: `${l.dealershipName}: ${l.location.name}`, lat: l.location.latitude, lng: l.location.longitude, radiusKm: l.location.defaultRadiusKm, tone: l.location.status === "active" ? "brand" : "muted" }))} />
          </Card>
          <div className="mt-6">
            <Table>
              <THead><tr><Th>Dealership</Th><Th>Location</Th><Th>City</Th><Th>PIN</Th><Th>Radius</Th><Th>Status</Th></tr></THead>
              <TBody>
                {locs.map((l) => (
                  <tr key={l.location.id}>
                    <Td><Link href={`/app/dealerships/${l.location.dealershipId}`} className="text-road-600 hover:underline">{l.dealershipName}</Link></Td>
                    <Td className="font-medium">{l.location.name}</Td>
                    <Td>{l.location.city}</Td>
                    <Td>{l.location.pincode}</Td>
                    <Td>{l.location.defaultRadiusKm} km</Td>
                    <Td><StatusBadge status={l.location.status} /></Td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </div>
        </>
      )}
    </>
  );
}
