import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { EDITABLE_STATUSES, getCampaign } from "@/server/services/campaigns";
import { ProductStep } from "./product-step";
import { PlatformsStep } from "./platforms-step";
import { TargetingStep } from "./targeting-step";
import { BudgetStep } from "./budget-step";
import { CreativeStep } from "./creative-step";

export const metadata: Metadata = { title: "Edit campaign" };

const STEPS = [
  { key: "product", n: 2, label: "Objective & product" },
  { key: "platforms", n: 4, label: "Platforms" },
  { key: "targeting", n: 5, label: "Targeting & audience" },
  { key: "budget", n: 7, label: "Budget & schedule" },
  { key: "creative", n: 8, label: "Creative" },
] as const;

export default async function EditCampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string }> }) {
  const { id } = await params;
  const { step = "product" } = await searchParams;
  const actor = await requireOrgActor();
  const full = await getCampaign(getDb(), actor, id, "campaign.edit");
  if (!(EDITABLE_STATUSES as readonly string[]).includes(full.campaign.status)) redirect(`/app/campaigns/${id}`);
  const current = STEPS.find((s) => s.key === step) ?? STEPS[0];
  return (
    <>
      <PageHeader
        eyebrow={<Link href={`/app/campaigns/${id}`} className="hover:underline">{full.campaign.name}</Link>}
        title={`Step ${current.n} of 9: ${current.label}`}
        description={`${full.dealership.name}: ${full.primaryLocation.name}`}
      />
      <nav aria-label="Campaign steps" className="mb-6 flex flex-wrap gap-2">
        <span className="rounded-full bg-ok-100 px-3 py-1 text-xs font-semibold text-ok-700">1. Location ✓</span>
        {STEPS.map((s) => (
          <Link
            key={s.key}
            href={`/app/campaigns/${id}/edit?step=${s.key}`}
            aria-current={s.key === current.key ? "step" : undefined}
            className={cn("rounded-full px-3 py-1 text-xs font-semibold", s.key === current.key ? "bg-ink-900 text-white" : "bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50")}
          >
            {s.n}. {s.label}
          </Link>
        ))}
        <Link href={`/app/campaigns/${id}/review`} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50">9. Review</Link>
      </nav>
      {current.key === "product" && <ProductStep full={full} />}
      {current.key === "platforms" && <PlatformsStep full={full} actor={actor} />}
      {current.key === "targeting" && <TargetingStep full={full} actor={actor} />}
      {current.key === "budget" && <BudgetStep full={full} />}
      {current.key === "creative" && <CreativeStep full={full} actor={actor} />}
    </>
  );
}
