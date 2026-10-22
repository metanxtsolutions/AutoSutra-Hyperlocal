import type { DbOrTx } from "./db/client";
import { auditLogs } from "./db/schema";
import { actorLabel, isSystem, type AnyActor } from "./auth/context";

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  organisationId?: string | null;
  summary: string;
  data?: Record<string, unknown>;
}

/** Append an audit record inside the caller's transaction, so it commits with the change. */
export async function audit(db: DbOrTx, actor: AnyActor | null, input: AuditInput): Promise<void> {
  await db.insert(auditLogs).values({
    actorUserId: actor && !isSystem(actor) ? actor.user.id : null,
    actorLabel: actor ? actorLabel(actor) : "anonymous",
    organisationId: input.organisationId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    summary: input.summary.slice(0, 500),
    data: input.data ?? {},
    ip: actor && !isSystem(actor) ? (actor.ip ?? null) : null,
  });
}
