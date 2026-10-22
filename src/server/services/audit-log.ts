import { and, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { auditLogs } from "../db/schema";
import { requireOrg, requirePlatform, type Actor } from "../auth/context";

export interface AuditFilter {
  q?: string;
  action?: string;
  from?: string;
  to?: string;
  organisationId?: string;
  page?: number;
}

const PAGE = 50;

function conditions(f: AuditFilter): SQL[] {
  const c: SQL[] = [];
  if (f.q) c.push(or(ilike(auditLogs.summary, `%${f.q}%`), ilike(auditLogs.actorLabel, `%${f.q}%`))!);
  if (f.action) c.push(ilike(auditLogs.action, `${f.action}%`));
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) c.push(gte(auditLogs.createdAt, new Date(`${f.from}T00:00:00+05:30`)));
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) c.push(lte(auditLogs.createdAt, new Date(`${f.to}T23:59:59+05:30`)));
  return c;
}

export async function orgAuditLog(db: DbOrTx, actor: Actor, organisationId: string, f: AuditFilter) {
  requireOrg(actor, organisationId, "org.manage");
  const page = Math.max(1, f.page ?? 1);
  return db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.organisationId, organisationId), ...conditions(f)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(PAGE + 1)
    .offset((page - 1) * PAGE);
}

export async function platformAuditLog(db: DbOrTx, actor: Actor, f: AuditFilter) {
  requirePlatform(actor, "platform.view_all");
  const page = Math.max(1, f.page ?? 1);
  const c = conditions(f);
  if (f.organisationId) c.push(eq(auditLogs.organisationId, f.organisationId));
  return db
    .select()
    .from(auditLogs)
    .where(c.length ? and(...c) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(PAGE + 1)
    .offset((page - 1) * PAGE);
}

export const AUDIT_PAGE_SIZE = PAGE;
