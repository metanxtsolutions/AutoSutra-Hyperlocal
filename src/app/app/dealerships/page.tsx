import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { DEALERSHIP_TYPE_OPTIONS, VEHICLE_CATEGORY_OPTIONS, labelFor } from "@/lib/catalog";
import { can } from "@/server/auth/context";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listDealerships, listLocations } from "@/server/services/dealerships";

export const metadata: Metadata = { title: "Dealerships" };

export default async function DealershipsPage() {
  const actor = await requireOrgActor();
  const db = getDb();
  const orgId = actor.membership.organisationId;
  const [rows, locs] = await Promise.all([listDealerships(db, actor, orgId), listLocations(db, actor, orgId)]);
  const canManage = can(actor, orgId, "dealership.manage");
  return (
    <>
      <PageHeader
        title="Dealerships"
        description="Each dealership has its own brands, address, verification status and locations."
        actions={canManage && <ButtonLink href="/app/dealerships/new">Add dealership</ButtonLink>}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No dealerships yet"
          description="Add your first dealership, then add its showroom and service locations."
          action={canManage && <ButtonLink href="/app/dealerships/new">Add dealership</ButtonLink>}
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Dealership</Th>
              <Th>Brands</Th>
              <Th>Type</Th>
              <Th>City</Th>
              <Th>Locations</Th>
              <Th>Verification</Th>
              <Th>Status</Th>
            </tr>
          </THead>
          <TBody>
            {rows.map((d) => (
              <tr key={d.id}>
                <Td>
                  <Link href={`/app/dealerships/${d.id}`} className="font-semibold text-road-600 hover:underline">{d.name}</Link>
                  <div className="text-xs text-ink-500">{labelFor(VEHICLE_CATEGORY_OPTIONS, d.vehicleCategory)}</div>
                </Td>
                <Td>{d.brands.join(", ")}</Td>
                <Td>{labelFor(DEALERSHIP_TYPE_OPTIONS, d.dealershipType)}</Td>
                <Td>{d.city}, {d.state}</Td>
                <Td>{locs.filter((l) => l.location.dealershipId === d.id).length}</Td>
                <Td><StatusBadge status={d.verificationStatus} /></Td>
                <Td><StatusBadge status={d.status} /></Td>
              </tr>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
