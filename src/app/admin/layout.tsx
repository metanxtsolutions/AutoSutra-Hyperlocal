import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app/shell";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { adminNav } from "@/server/nav";
import { adminNavCounts } from "@/server/services/admin";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  if (!actor.user.platformRole) notFound();
  // Staff tools need a session that passed two-step verification (the services enforce this too).
  if (!actor.mfaVerified) redirect("/app/account/security?required=staff");
  const counts = await adminNavCounts(getDb());
  return (
    <AppShell actor={actor} nav={adminNav(actor, counts)} area="admin">
      {children}
    </AppShell>
  );
}
