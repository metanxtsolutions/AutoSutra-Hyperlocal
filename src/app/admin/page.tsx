import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHeader, PageHeader, Stat } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { allFlags } from "@/server/flags";
import { effectiveMode, MODE_LABELS } from "@/server/providers/modes";
import { overview } from "@/server/services/admin";
import { listPlatformNotifications } from "@/server/services/notifications";
import { getEnv } from "@/server/env";

export const metadata: Metadata = { title: "Admin overview" };

export default async function AdminOverview() {
  const actor = await requireActor();
  const db = getDb();
  const [o, alerts, flags, meta, google] = await Promise.all([overview(db, actor), listPlatformNotifications(db, actor, 15), allFlags(db), effectiveMode(db, "meta"), effectiveMode(db, "google")]);
  const env = getEnv();
  const tile = (label: string, value: number, href: string, tone?: "warn" | "bad") => (
    <Link href={href} className="block"><Stat label={label} value={value} tone={value ? tone : undefined} /></Link>
  );
  return (
    <>
      <PageHeader title="AutoSutra operations" description="Platform-wide view for AutoSutra staff. Every action here is recorded in the audit log." />
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {tile("Organisations", o.orgs, "/admin/organisations")}
        {tile("Awaiting verification", o.pendingVerification, "/admin/organisations?verification=pending", "warn")}
        {tile("Managed: ready to launch", o.readyManaged, "/admin/campaigns?status=ready_to_publish", "warn")}
        {tile("Failed publications", o.failedPlatforms, "/admin/jobs", "bad")}
        {tile("Dead or failed jobs", o.deadJobs, "/admin/jobs", "bad")}
        {tile("Connection problems", o.badConnections, "/admin/connections", "warn")}
        {tile("Open reconciliation items", o.openDiffs, "/admin/finance/reconciliation", "warn")}
        {tile("Refund requests", o.refundRequests, "/admin/finance/refunds", "warn")}
        {tile("Open tickets", o.openTickets, "/admin/support", "warn")}
        {tile("New contact requests", o.newContacts, "/admin/contact-requests")}
        {tile("Suspended organisations", o.suspended, "/admin/organisations")}
        {tile("Managed: awaiting customer", o.pendingApproval, "/admin/campaigns?status=pending_approval")}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Operations alerts" />
          {alerts.length === 0 ? <p className="text-sm text-ink-500">No alerts.</p> : (
            <ul className="space-y-2 text-sm">
              {alerts.map((a) => (
                <li key={a.id}>
                  <span className={a.severity === "critical" ? "font-semibold text-bad-700" : a.severity === "warning" ? "font-semibold text-warn-700" : "text-ink-500"}>{a.severity}</span>{" "}
                  {a.link ? <Link href={a.link} className="hover:underline">{a.title}</Link> : a.title}: <span className="text-ink-600">{a.body}</span>
                  <div className="text-xs text-ink-400">{formatDateTime(a.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Platform configuration" actions={<Link href="/admin/flags" className="text-sm text-road-600">Manage</Link>} />
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt>Meta publishing</dt><dd><Badge tone={meta === "live" ? "ok" : "demo"}>{MODE_LABELS[meta]}</Badge></dd></div>
            <div className="flex justify-between"><dt>Google Ads publishing</dt><dd><Badge tone={google === "live" ? "ok" : "demo"}>{MODE_LABELS[google]}</Badge></dd></div>
            <div className="flex justify-between"><dt>Payment gateway</dt><dd>{env.PAYMENT_GATEWAY}{env.PAYMENTS_LIVE ? " (live)" : " (test)"}</dd></div>
            {flags.map((f) => <div key={f.key} className="flex justify-between"><dt className="text-ink-600">{f.key}</dt><dd>{f.enabled ? <Badge tone="warn">On</Badge> : <Badge>Off</Badge>}</dd></div>)}
          </dl>
        </Card>
      </div>
    </>
  );
}
