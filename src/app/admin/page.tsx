import type { Metadata } from "next";
import Link from "next/link";
import { Activity, AlertTriangle, Ban, Building2, Hourglass, Info, LifeBuoy, MessageSquare, OctagonAlert, Plug, Rocket, Scale, ShieldQuestion, Undo2 } from "lucide-react";
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
  const tile = (label: string, value: number, href: string, icon: React.ReactNode, tone?: "warn" | "bad") => (
    <Stat key={label} label={label} value={value} tone={value ? tone : undefined} icon={icon} href={href} />
  );
  const groups = [
    {
      title: "Customers",
      tiles: [
        tile("Organisations", o.orgs, "/admin/organisations", <Building2 />),
        tile("Awaiting verification", o.pendingVerification, "/admin/organisations?verification=pending", <ShieldQuestion />, "warn"),
        tile("Suspended organisations", o.suspended, "/admin/organisations", <Ban />),
        tile("New contact requests", o.newContacts, "/admin/contact-requests", <MessageSquare />),
      ],
    },
    {
      title: "Campaigns and providers",
      tiles: [
        tile("Managed: ready to launch", o.readyManaged, "/admin/campaigns?status=ready_to_publish", <Rocket />, "warn"),
        tile("Managed: awaiting customer", o.pendingApproval, "/admin/campaigns?status=pending_approval", <Hourglass />),
        tile("Failed publications", o.failedPlatforms, "/admin/jobs", <OctagonAlert />, "bad"),
        tile("Dead or failed jobs", o.deadJobs, "/admin/jobs", <Activity />, "bad"),
        tile("Connection problems", o.badConnections, "/admin/connections", <Plug />, "warn"),
      ],
    },
    {
      title: "Finance and support",
      tiles: [
        tile("Open reconciliation items", o.openDiffs, "/admin/finance/reconciliation", <Scale />, "warn"),
        tile("Refund requests", o.refundRequests, "/admin/finance/refunds", <Undo2 />, "warn"),
        tile("Open tickets", o.openTickets, "/admin/support", <LifeBuoy />, "warn"),
      ],
    },
  ];
  return (
    <>
      <PageHeader title="AutoSutra operations" description="Platform-wide view for AutoSutra staff. Every action here is recorded in the audit log." />
      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.title}>
            <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wider text-ink-500">{g.title}</h2>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">{g.tiles}</div>
          </section>
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Operations alerts" />
          {alerts.length === 0 ? <p className="text-sm text-ink-500">No alerts.</p> : (
            <ul className="-mx-5 divide-y divide-ink-100 border-t border-ink-100">
              {alerts.map((a) => {
                const Icon = a.severity === "critical" ? OctagonAlert : a.severity === "warning" ? AlertTriangle : Info;
                return (
                  <li key={a.id} className="flex gap-3 px-5 py-3 text-sm">
                    <Icon aria-hidden className={a.severity === "critical" ? "mt-0.5 h-4 w-4 flex-none text-bad-700" : a.severity === "warning" ? "mt-0.5 h-4 w-4 flex-none text-warn-700" : "mt-0.5 h-4 w-4 flex-none text-ink-400"} />
                    <div className="min-w-0">
                      <span className="sr-only">{a.severity}: </span>
                      {a.link ? <Link href={a.link} className="font-medium text-ink-900 hover:text-road-600">{a.title}</Link> : <span className="font-medium text-ink-900">{a.title}</span>}
                      <p className="text-ink-600">{a.body}</p>
                      <div className="text-xs text-ink-400">{formatDateTime(a.createdAt)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Platform configuration" actions={<Link href="/admin/flags" className="text-sm text-road-600">Manage</Link>} />
          <dl className="space-y-2.5 text-sm">
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
