import { and, count, desc, eq, isNull } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { campaigns, leads, notifications } from "../db/schema";
import { requireOrg, requirePlatform, type Actor } from "../auth/context";

export interface NotifyInput {
  organisationId: string | null;
  audience?: "organisation" | "platform";
  kind: string;
  severity?: "info" | "warning" | "critical";
  title: string;
  body: string;
  link?: string;
  /** Same key = same alert; duplicates are ignored. Include a period or threshold in the key when an alert may legitimately repeat. */
  dedupeKey: string;
}

/** Create a notification unless one with the same dedupe key already exists. Returns true if created. */
export async function notify(db: DbOrTx, n: NotifyInput): Promise<boolean> {
  const rows = await db
    .insert(notifications)
    .values({
      organisationId: n.organisationId,
      audience: n.audience ?? "organisation",
      kind: n.kind,
      severity: n.severity ?? "info",
      title: n.title,
      body: n.body,
      link: n.link ?? null,
      dedupeKey: n.dedupeKey,
    })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id });
  return rows.length > 0;
}

export async function listOrgNotifications(db: DbOrTx, actor: Actor, organisationId: string, limit = 100) {
  requireOrg(actor, organisationId, "dealership.view");
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.organisationId, organisationId), eq(notifications.audience, "organisation")))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function listPlatformNotifications(db: DbOrTx, actor: Actor, limit = 100) {
  requirePlatform(actor, "platform.view_all");
  return db.select().from(notifications).where(eq(notifications.audience, "platform")).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function markRead(db: DbOrTx, actor: Actor, organisationId: string | null) {
  if (organisationId) {
    requireOrg(actor, organisationId, "dealership.view");
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.organisationId, organisationId), eq(notifications.audience, "organisation"), isNull(notifications.readAt)));
  } else {
    requirePlatform(actor, "platform.view_all");
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.audience, "platform"), isNull(notifications.readAt)));
  }
}

export async function navCounts(db: DbOrTx, actor: Actor) {
  const orgId = actor.membership?.organisationId;
  if (!orgId) return {};
  const [unread] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.organisationId, orgId), eq(notifications.audience, "organisation"), isNull(notifications.readAt)));
  const [approvals] = await db
    .select({ n: count() })
    .from(campaigns)
    .where(and(eq(campaigns.organisationId, orgId), eq(campaigns.status, "pending_approval")));
  const [newLeads] = await db
    .select({ n: count() })
    .from(leads)
    .where(and(eq(leads.organisationId, orgId), eq(leads.status, "new"), isNull(leads.anonymisedAt)));
  return { notifications: unread.n, approvals: approvals.n, leads: newLeads.n };
}
