import type { Metadata } from "next";
import Link from "next/link";
import { Building2, MapPin, Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
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
        actions={canManage && <ButtonLink href="/app/dealerships/new"><Plus />Add dealership</ButtonLink>}
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title="No dealerships yet"
          description="Add your first dealership, then add its showroom and service locations."
          action={canManage && <ButtonLink href="/app/dealerships/new">Add dealership</ButtonLink>}
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((d) => {
            const count = locs.filter((l) => l.location.dealershipId === d.id).length;
            return (
              <li key={d.id}>
                <Link href={`/app/dealerships/${d.id}`} className="group flex h-full flex-col rounded-[var(--radius-card)] border border-ink-200/80 bg-white p-5 shadow-[var(--shadow-card)] transition-colors hover:border-ink-300">
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-ink-900 text-sm font-semibold text-white">{d.name.charAt(0).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-ink-950 group-hover:text-road-600">{d.name}</div>
                      <div className="truncate text-xs text-ink-500">{labelFor(DEALERSHIP_TYPE_OPTIONS, d.dealershipType)} · {labelFor(VEHICLE_CATEGORY_OPTIONS, d.vehicleCategory)}</div>
                    </div>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="mb-4 mt-4 flex flex-1 flex-wrap content-start gap-1.5">
                    {d.brands.map((b) => <span key={b} className="rounded-md bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700">{b}</span>)}
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-ink-100 pt-3 text-sm text-ink-600">
                    <span className="inline-flex items-center gap-1.5"><MapPin aria-hidden className="h-4 w-4 text-ink-400" />{d.city}, {d.state}</span>
                    <span>{count} location{count === 1 ? "" : "s"}</span>
                  </div>
                  <div className="mt-2 text-xs text-ink-500">Verification: <StatusBadge status={d.verificationStatus} /></div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
