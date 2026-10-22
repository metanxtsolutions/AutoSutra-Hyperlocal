import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui/card";
import { requireOrgActor } from "@/server/auth/session";
import { requireOrg } from "@/server/auth/context";
import { DealershipForm } from "../dealership-form";
import { createDealershipAction } from "../actions";

export const metadata: Metadata = { title: "Add dealership" };

export default async function NewDealershipPage() {
  const actor = await requireOrgActor();
  requireOrg(actor, actor.membership.organisationId, "dealership.manage");
  return (
    <>
      <PageHeader title="Add dealership" eyebrow="Dealerships" />
      <Card className="max-w-4xl">
        <DealershipForm action={createDealershipAction} submitLabel="Add dealership" />
      </Card>
    </>
  );
}
