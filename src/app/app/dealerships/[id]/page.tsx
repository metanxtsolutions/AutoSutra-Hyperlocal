import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, DescriptionList, EmptyState, PageHeader } from "@/components/ui/card";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { LocationMap } from "@/components/map/location-map";
import { DEALERSHIP_TYPE_OPTIONS, LOCATION_KIND_OPTIONS, VEHICLE_CATEGORY_OPTIONS, labelFor } from "@/lib/catalog";
import { formatINR } from "@/lib/money";
import { can } from "@/server/auth/context";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getDealership, listLocations } from "@/server/services/dealerships";
import { setDealershipStatusAction, setLocationStatusAction } from "../actions";

export const metadata: Metadata = { title: "Dealership" };

export default async function DealershipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireOrgActor();
  const db = getDb();
  const d = await getDealership(db, actor, id);
  const locs = await listLocations(db, actor, d.organisationId, d.id);
  const canManage = can(actor, d.organisationId, "dealership.manage");
  const canLoc = can(actor, d.organisationId, "location.manage");
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/app/dealerships" className="hover:underline">Dealerships</Link>}
        title={d.name}
        description={`${d.brands.join(", ")} · ${labelFor(DEALERSHIP_TYPE_OPTIONS, d.dealershipType)}`}
        actions={
          <>
            {canManage && <ButtonLink href={`/app/dealerships/${d.id}/edit`} variant="secondary">Edit</ButtonLink>}
            {canManage && (
              <form action={setDealershipStatusAction.bind(null, d.id, d.status === "active" ? "inactive" : "active")}>
                <Button variant="ghost" type="submit">{d.status === "active" ? "Deactivate" : "Reactivate"}</Button>
              </form>
            )}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Details" actions={<><StatusBadge status={d.verificationStatus} label={`Verification: ${d.verificationStatus}`} /> <StatusBadge status={d.status} /></>} />
          <DescriptionList
            items={[
              { label: "Vehicle category", value: labelFor(VEHICLE_CATEGORY_OPTIONS, d.vehicleCategory) },
              { label: "Address", value: `${d.address}, ${d.city}, ${d.state} ${d.pincode}` },
              { label: "Contact", value: [d.contactName, d.contactPhone, d.businessEmail].filter(Boolean).join(" · ") || "–" },
              { label: "Website", value: d.website ? <a className="text-road-600 underline" href={d.website} rel="noreferrer noopener" target="_blank">{d.website}</a> : "–" },
              { label: "Google Business Profile", value: d.googleBusinessProfileUrl ? <a className="text-road-600 underline" href={d.googleBusinessProfileUrl} rel="noreferrer noopener" target="_blank">Open</a> : "–" },
              { label: "GSTIN", value: d.gstin ?? "–" },
            ]}
          />
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Locations map" description="Default catchment for each location." />
          <LocationMap points={locs.map((l) => ({ id: l.location.id, name: l.location.name, lat: l.location.latitude, lng: l.location.longitude, radiusKm: l.location.defaultRadiusKm, tone: l.location.status === "active" ? "brand" : "muted" }))} />
        </Card>
      </div>
      <div className="mt-6">
        <CardHeader title="Locations" actions={canLoc && <ButtonLink href={`/app/dealerships/${d.id}/locations/new`}>Add location</ButtonLink>} />
        {locs.length === 0 ? (
          <EmptyState title="No locations yet" description="Add a showroom, service centre or pre-owned outlet with its map pin and target radius." />
        ) : (
          <Table>
            <THead>
              <tr><Th>Location</Th><Th>Type</Th><Th>Address</Th><Th>Radius</Th><Th>Budget limit</Th><Th>Status</Th><Th></Th></tr>
            </THead>
            <TBody>
              {locs.map(({ location: l }) => (
                <tr key={l.id}>
                  <Td className="font-medium">{l.name}</Td>
                  <Td>{labelFor(LOCATION_KIND_OPTIONS, l.kind)}</Td>
                  <Td>{l.address}, {l.city} {l.pincode}</Td>
                  <Td>{l.defaultRadiusKm} km</Td>
                  <Td>{l.monthlyBudgetLimit ? `${formatINR(l.monthlyBudgetLimit, { decimals: false })}/month` : "–"}</Td>
                  <Td><StatusBadge status={l.status} /></Td>
                  <Td className="whitespace-nowrap text-right">
                    {canLoc && (
                      <div className="flex justify-end gap-2">
                        <ButtonLink size="sm" variant="secondary" href={`/app/locations/${l.id}/edit`}>Edit</ButtonLink>
                        <form action={setLocationStatusAction.bind(null, l.id, d.id, l.status === "active" ? "inactive" : "active")}>
                          <Button size="sm" variant="ghost" type="submit">{l.status === "active" ? "Deactivate" : "Reactivate"}</Button>
                        </form>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </>
  );
}
