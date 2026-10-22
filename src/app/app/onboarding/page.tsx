import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { onboardingStatus } from "@/server/services/organisations";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Setup checklist" };

export default async function OnboardingPage() {
  const actor = await requireActor();
  const steps = await onboardingStatus(getDb(), actor);
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  return (
    <>
      <PageHeader
        title="Set up AutoSutra"
        description="Complete these steps to be ready to publish your first campaign. You can save progress and come back at any time."
      />
      <Card>
        <div className="mb-4">
          <div className="flex justify-between text-sm">
            <span className="font-medium">{done} of {steps.length} complete</span>
            {next && <span className="text-ink-500">Next: {next.label}</span>}
          </div>
          <div className="mt-2 h-2 rounded-full bg-ink-100" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} aria-label="Setup progress">
            <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(done / steps.length) * 100}%` }} />
          </div>
        </div>
        <ol className="divide-y divide-ink-100">
          {steps.map((s, i) => {
            const blocked = !s.done && steps.slice(0, i).some((p) => !p.done && ["verify", "organisation"].includes(p.key));
            return (
              <li key={s.key} className="flex items-center gap-4 py-3">
                <span
                  aria-hidden
                  className={cn(
                    "flex h-7 w-7 flex-none items-center justify-center rounded-full text-sm font-bold",
                    s.done ? "bg-ok-100 text-ok-700" : "bg-ink-100 text-ink-600",
                  )}
                >
                  {s.done ? "✓" : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{s.label}</div>
                  <div className="text-sm text-ink-500">{s.detail}</div>
                </div>
                {!s.done && !blocked && (
                  <Link href={s.href} className="text-sm font-semibold text-road-600 hover:underline">
                    {s.key === "verify" ? "Resend" : "Start"}
                  </Link>
                )}
                {blocked && <span className="text-xs text-ink-400">Complete earlier steps first</span>}
              </li>
            );
          })}
        </ol>
      </Card>
      <p className="mt-4 text-sm text-ink-500">
        Campaign readiness checks (ad account permissions, funding and creative policy checks) run in the campaign builder before you can submit a campaign.
      </p>
    </>
  );
}
