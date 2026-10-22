import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listOrgNotifications } from "@/server/services/notifications";
import { markAllReadAction } from "./actions";

export const metadata: Metadata = { title: "Notifications" };

const SEVERITY = { critical: "⚠ Critical", warning: "! Warning", info: "Info" } as Record<string, string>;

export default async function NotificationsPage() {
  const actor = await requireOrgActor();
  const items = await listOrgNotifications(getDb(), actor, actor.membership.organisationId);
  return (
    <>
      <PageHeader title="Notifications" actions={<form action={markAllReadAction}><Button variant="secondary" type="submit">Mark all read</Button></form>} />
      {items.length === 0 ? (
        <EmptyState title="No notifications" />
      ) : (
        <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200 bg-white">
          {items.map((n) => (
            <li key={n.id} className={`flex gap-3 p-4 ${n.readAt ? "" : "bg-road-100/30"}`}>
              <span className={`w-20 flex-none text-xs font-semibold ${n.severity === "critical" ? "text-bad-700" : n.severity === "warning" ? "text-warn-700" : "text-ink-500"}`}>{SEVERITY[n.severity] ?? n.severity}</span>
              <div className="min-w-0">
                <div className="font-medium">{n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}</div>
                <p className="text-sm text-ink-600">{n.body}</p>
                <div className="text-xs text-ink-400">{formatDateTime(n.createdAt)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
