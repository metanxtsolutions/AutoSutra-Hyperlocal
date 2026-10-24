import { AppShell } from "@/components/app/shell";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { isEnabled } from "@/server/flags";
import { customerNav } from "@/server/nav";
import { navCounts } from "@/server/services/notifications";
import { listMyOrganisations, onboardingStatus } from "@/server/services/organisations";
import { Alert } from "@/components/ui/card";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const db = getDb();
  const [orgs, steps, walletEnabled, counts] = await Promise.all([
    listMyOrganisations(db, actor.user.id),
    onboardingStatus(db, actor),
    isEnabled(db, "central_wallet"),
    navCounts(db, actor),
  ]);
  const onboardingDone = steps.every((s) => s.done);
  const banner = !actor.user.emailVerified ? (
    <div className="border-b border-warn-100 bg-warn-50 px-4 py-2 text-center text-sm text-ink-900">
      Please verify your email address. <Link href="/verify-email" className="font-semibold underline">Resend link</Link>
    </div>
  ) : null;
  return (
    <AppShell actor={actor} nav={customerNav(actor, { walletEnabled, onboardingDone, counts })} orgs={orgs} banner={banner} notifications={actor.membership ? { href: "/app/notifications", count: counts.notifications ?? 0 } : undefined}>
      {orgs.some((o) => o.status === "suspended" && o.id === actor.membership?.organisationId) && (
        <div className="mb-4">
          <Alert tone="bad" title="This organisation is suspended">Contact AutoSutra support. Data is read-only until the suspension is lifted.</Alert>
        </div>
      )}
      {children}
    </AppShell>
  );
}
