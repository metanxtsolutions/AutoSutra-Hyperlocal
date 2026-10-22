import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader, PageHeader, Stat } from "@/components/ui/card";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listDealerships, listLocations } from "@/server/services/dealerships";
import { onboardingStatus } from "@/server/services/organisations";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const actor = await requireOrgActor();
  const db = getDb();
  const orgId = actor.membership.organisationId;
  const [dealers, locs, steps] = await Promise.all([listDealerships(db, actor, orgId), listLocations(db, actor, orgId), onboardingStatus(db, actor)]);
  const pending = steps.filter((s) => !s.done);
  return (
    <>
      <PageHeader title={`Welcome, ${actor.user.name.split(" ")[0]}`} description={actor.membership.organisationName} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Dealerships" value={dealers.length} />
        <Stat label="Active locations" value={locs.filter((l) => l.location.status === "active").length} />
        <Stat label="Setup steps left" value={pending.length} tone={pending.length ? "warn" : "ok"} />
      </div>
      {pending.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Finish setting up" actions={<Link href="/app/onboarding" className="text-sm font-semibold text-road-600">Open checklist</Link>} />
          <ul className="list-disc pl-5 text-sm">
            {pending.map((s) => (
              <li key={s.key}><Link href={s.href} className="text-road-600 hover:underline">{s.label}</Link>: {s.detail}</li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
