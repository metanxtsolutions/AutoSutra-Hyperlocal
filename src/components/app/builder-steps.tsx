import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export const BUILDER_STEPS = [
  { key: "location", label: "Location" },
  { key: "product", label: "Objective & product" },
  { key: "platforms", label: "Platforms" },
  { key: "targeting", label: "Targeting & audience" },
  { key: "budget", label: "Budget & schedule" },
  { key: "creative", label: "Creative" },
  { key: "review", label: "Review" },
] as const;

export type BuilderStepKey = (typeof BUILDER_STEPS)[number]["key"];

export function builderStep(key: BuilderStepKey) {
  const i = BUILDER_STEPS.findIndex((s) => s.key === key);
  return { ...BUILDER_STEPS[i], n: i + 1, total: BUILDER_STEPS.length };
}

function stepHref(campaignId: string, key: BuilderStepKey) {
  if (key === "review") return `/app/campaigns/${campaignId}/review`;
  if (key === "location") return null; // fixed once the draft exists
  return `/app/campaigns/${campaignId}/edit?step=${key}`;
}

/** Campaign builder progress. Steps can be visited in any order once the draft exists. */
export function BuilderSteps({ campaignId, current }: { campaignId?: string; current: BuilderStepKey }) {
  return (
    <nav aria-label="Campaign steps" className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ol className="flex min-w-max items-center gap-2 rounded-xl border border-ink-200/80 bg-white p-2 shadow-[var(--shadow-card)] sm:min-w-0">
        {BUILDER_STEPS.map((s, i) => {
          const active = s.key === current;
          const done = s.key === "location" && !!campaignId;
          const href = campaignId ? stepHref(campaignId, s.key) : null;
          const body = (
            <>
              <span
                className={cn(
                  "flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-semibold",
                  done ? "bg-ok-700 text-white" : active ? "bg-road-600 text-white" : "bg-ink-100 text-ink-600",
                )}
              >
                {done ? <Check aria-hidden className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn("whitespace-nowrap text-[13px] font-medium", active ? "text-ink-950" : "text-ink-600")}>
                {s.label}
                {done && <span className="sr-only"> (done)</span>}
              </span>
            </>
          );
          const cls = cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5", active && "bg-road-50", href && !active && "hover:bg-ink-50");
          return (
            <li key={s.key} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden className="h-px w-3 bg-ink-200 lg:w-5" />}
              {href && !active ? (
                <Link href={href} className={cls}>{body}</Link>
              ) : (
                <span className={cls} aria-current={active ? "step" : undefined}>{body}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
