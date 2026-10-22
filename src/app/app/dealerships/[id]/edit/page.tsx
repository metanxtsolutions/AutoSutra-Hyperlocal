import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui/card";
import { requireOrg } from "@/server/auth/context";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getDealership } from "@/server/services/dealerships";
import { DealershipForm } from "../../dealership-form";
import { updateDealershipAction } from "../../actions";

export const metadata: Metadata = { title: "Edit dealership" };

export default async function EditDealershipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireOrgActor();
  const d = await getDealership(getDb(), actor, id);
  requireOrg(actor, d.organisationId, "dealership.manage");
  return (
    <>
      <PageHeader title={`Edit ${d.name}`} eyebrow="Dealerships" description="Changing the name, address or GSTIN of a verified dealership sends it back for verification." />
      <Card className="max-w-4xl">
        <DealershipForm action={updateDealershipAction.bind(null, d.id)} d={d} submitLabel="Save changes" />
      </Card>
    </>
  );
}
