import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/card";
import { BuilderSteps, builderStep } from "@/components/app/builder-steps";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { EDITABLE_STATUSES, getCampaign } from "@/server/services/campaigns";
import { ProductStep } from "./product-step";
import { PlatformsStep } from "./platforms-step";
import { TargetingStep } from "./targeting-step";
import { BudgetStep } from "./budget-step";
import { CreativeStep } from "./creative-step";

export const metadata: Metadata = { title: "Edit campaign" };

const EDIT_STEPS = ["product", "platforms", "targeting", "budget", "creative"] as const;

export default async function EditCampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const { id } = await params;
  const { step = "product" } = await searchParams;
  const actor = await requireOrgActor();
  const full = await getCampaign(getDb(), actor, id, "campaign.edit");
  if (!(EDITABLE_STATUSES as readonly string[]).includes(full.campaign.status)) redirect(`/app/campaigns/${id}`);
  const current = builderStep((EDIT_STEPS as readonly string[]).includes(step) ? (step as (typeof EDIT_STEPS)[number]) : "product");
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Campaigns", href: "/app/campaigns" }, { label: full.campaign.name, href: `/app/campaigns/${id}` }]}
        title={current.label}
        description={`Step ${current.n} of ${current.total} · ${full.dealership.name}: ${full.primaryLocation.name}`}
      />
      <BuilderSteps campaignId={id} current={current.key} />
      {current.key === "product" && <ProductStep full={full} />}
      {current.key === "platforms" && <PlatformsStep full={full} actor={actor} />}
      {current.key === "targeting" && <TargetingStep full={full} actor={actor} />}
      {current.key === "budget" && <BudgetStep full={full} />}
      {current.key === "creative" && <CreativeStep full={full} actor={actor} />}
    </>
  );
}
