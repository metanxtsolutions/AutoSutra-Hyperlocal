import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "../db/client";
import {
  advertisingConnections,
  campaignPlatforms,
  campaigns,
  contactRequests,
  jobs,
  organisationMemberships,
  organisations,
  outboundEmails,
  publicationAttempts,
  reconciliationDifferences,
  refunds,
  sessions,
  supportTickets,
  users,
} from "../db/schema";
import { audit } from "../audit";
import { requirePlatform, type Actor } from "../auth/context";
import { PLATFORM_ROLES, type PlatformRole } from "../auth/permissions";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { getEnv } from "../env";

export async function overview(db: DbOrTx, actor: Actor) {
  requirePlatform(actor, "platform.view_all");
  const n = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);
  const [orgs, pendingVerification, suspended, pendingApproval, readyManaged, failedPlatforms, deadJobs, openDiffs, refundRequests, openTickets, newContacts, badConnections] = await Promise.all([
    n(db.select({ n: count() }).from(organisations)),
    n(db.select({ n: count() }).from(organisations).where(eq(organisations.verificationStatus, "pending"))),
    n(db.select({ n: count() }).from(organisations).where(eq(organisations.status, "suspended"))),
    n(db.select({ n: count() }).from(campaigns).where(and(eq(campaigns.managed, true), eq(campaigns.status, "pending_approval")))),
    n(db.select({ n: count() }).from(campaigns).where(and(eq(campaigns.managed, true), eq(campaigns.status, "ready_to_publish")))),
    n(db.select({ n: count() }).from(campaignPlatforms).where(eq(campaignPlatforms.status, "failed"))),
    n(db.select({ n: count() }).from(jobs).where(inArray(jobs.status, ["dead", "failed"]))),
    n(db.select({ n: count() }).from(reconciliationDifferences).where(eq(reconciliationDifferences.status, "open"))),
    n(db.select({ n: count() }).from(refunds).where(eq(refunds.status, "requested"))),
    n(db.select({ n: count() }).from(supportTickets).where(inArray(supportTickets.status, ["open", "in_progress"]))),
    n(db.select({ n: count() }).from(contactRequests).where(eq(contactRequests.status, "new"))),
    n(db.select({ n: count() }).from(advertisingConnections).where(inArray(advertisingConnections.status, ["error", "expired", "access_pending"]))),
  ]);
  return { orgs, pendingVerification, suspended, pendingApproval, readyManaged, failedPlatforms, deadJobs, openDiffs, refundRequests, openTickets, newContacts, badConnections };
}

export async function adminNavCounts(db: DbOrTx) {
  const one = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);
  return {
    approvals: await one(db.select({ n: count() }).from(campaigns).where(and(eq(campaigns.managed, true), inArray(campaigns.status, ["ready_to_publish"])))),
    diffs: await one(db.select({ n: count() }).from(reconciliationDifferences).where(eq(reconciliationDifferences.status, "open"))),
    refunds: await one(db.select({ n: count() }).from(refunds).where(eq(refunds.status, "requested"))),
    tickets: await one(db.select({ n: count() }).from(supportTickets).where(eq(supportTickets.status, "open"))),
  };
}

// ------------------------------------------------------------------ users

export async function listUsers(db: DbOrTx, actor: Actor, q?: string) {
  requirePlatform(actor, "platform.view_all");
  return db
    .select({
      user: { id: users.id, name: users.name, email: users.email, status: users.status, platformRole: users.platformRole, emailVerifiedAt: users.emailVerifiedAt, totpEnabledAt: users.totpEnabledAt, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt },
      orgs: sql<string[]>`coalesce((select array_agg(o.name) from ${organisationMemberships} m join ${organisations} o on o.id = m.organisation_id where m.user_id = ${users.id}), '{}')`,
    })
    .from(users)
    .where(q ? sql`${users.email} ILIKE ${"%" + q + "%"} OR ${users.name} ILIKE ${"%" + q + "%"}` : undefined)
    .orderBy(desc(users.createdAt))
    .limit(300);
}

export async function setUserStatus(db: Database, actor: Actor, userId: string, status: "active" | "suspended", reason: string) {
  requirePlatform(actor, "platform.admin");
  if (!reason.trim()) throw new ValidationError("A reason is required");
  if (userId === actor.user.id) throw new ForbiddenError("You cannot change your own status");
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u) throw new NotFoundError("User not found");
  await db.transaction(async (tx) => {
    await tx.update(users).set({ status }).where(eq(users.id, userId));
    if (status === "suspended") await tx.delete(sessions).where(eq(sessions.userId, userId));
    await audit(tx, actor, { action: status === "suspended" ? "user.suspended" : "user.reactivated", entityType: "user", entityId: userId, summary: `${status === "suspended" ? "Suspended" : "Reactivated"} ${u.email}: ${reason.trim()}` });
  });
}

export async function setPlatformRole(db: Database, actor: Actor, userId: string, role: PlatformRole | null, reason: string) {
  requirePlatform(actor, "platform.admin");
  if (actor.user.platformRole !== "super_admin") throw new ForbiddenError("Only a super admin can change staff roles");
  if (role !== null && !PLATFORM_ROLES.includes(role)) throw new ValidationError("Unknown role");
  if (!reason.trim()) throw new ValidationError("A reason is required");
  if (userId === actor.user.id) throw new ForbiddenError("You cannot change your own staff role");
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u) throw new NotFoundError("User not found");
  await db.transaction(async (tx) => {
    await tx.update(users).set({ platformRole: role }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId)); // re-login picks up new permissions
    await audit(tx, actor, { action: "user.platform_role_changed", entityType: "user", entityId: userId, summary: `Staff role for ${u.email}: ${u.platformRole ?? "none"} → ${role ?? "none"} (${reason.trim()})` });
  });
}

// ------------------------------------------------------------------ jobs & API health

export async function jobHealth(db: DbOrTx, actor: Actor) {
  requirePlatform(actor, "platform.view_all");
  const byStatus = await db.select({ type: jobs.type, status: jobs.status, n: count() }).from(jobs).groupBy(jobs.type, jobs.status);
  const problems = await db.select().from(jobs).where(inArray(jobs.status, ["dead", "failed"])).orderBy(desc(jobs.updatedAt)).limit(100);
  const oldestQueued = await db.select({ runAt: jobs.runAt }).from(jobs).where(eq(jobs.status, "queued")).orderBy(jobs.runAt).limit(1);
  const failedAttempts = await db
    .select({ a: publicationAttempts, provider: campaignPlatforms.provider, campaignName: campaigns.name, campaignId: campaigns.id })
    .from(publicationAttempts)
    .innerJoin(campaignPlatforms, eq(campaignPlatforms.id, publicationAttempts.campaignPlatformId))
    .innerJoin(campaigns, eq(campaigns.id, campaignPlatforms.campaignId))
    .where(eq(publicationAttempts.status, "failed"))
    .orderBy(desc(publicationAttempts.startedAt))
    .limit(50);
  const connections = await db
    .select({ c: advertisingConnections, organisationName: organisations.name })
    .from(advertisingConnections)
    .innerJoin(organisations, eq(organisations.id, advertisingConnections.organisationId))
    .orderBy(advertisingConnections.status);
  return { byStatus: byStatus.map((r) => ({ ...r, n: Number(r.n) })), problems, oldestQueued: oldestQueued[0]?.runAt ?? null, failedAttempts, connections };
}

export async function retryJob(db: Database, actor: Actor, jobId: string) {
  requirePlatform(actor, "platform.campaign_ops");
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId) });
  if (!job) throw new NotFoundError("Job not found");
  if (!["dead", "failed"].includes(job.status)) throw new ValidationError("Only failed jobs can be retried");
  await db.update(jobs).set({ status: "queued", attempts: 0, runAt: new Date(), lastError: null }).where(eq(jobs.id, jobId));
  await audit(db, actor, { action: "job.retried", entityType: "job", entityId: jobId, summary: `Retried ${job.type} job` });
}

/**
 * Recent outgoing emails for support ("did my verification email go out?").
 * Bodies carry one-time links, so they are only returned outside production.
 */
export async function listEmails(db: DbOrTx, actor: Actor) {
  requirePlatform(actor, "platform.view_all");
  const showBodies = getEnv().APP_STAGE !== "production";
  const rows = await db.select().from(outboundEmails).orderBy(desc(outboundEmails.createdAt)).limit(200);
  return { showBodies, rows: rows.map((r) => ({ ...r, body: showBodies ? r.body : null })) };
}

export async function listContactRequests(db: DbOrTx, actor: Actor) {
  requirePlatform(actor, "platform.view_all");
  return db.select().from(contactRequests).orderBy(desc(contactRequests.createdAt)).limit(200);
}

export async function setContactStatus(db: Database, actor: Actor, id: string, status: "new" | "contacted" | "closed") {
  requirePlatform(actor, "platform.view_all");
  await db.update(contactRequests).set({ status }).where(eq(contactRequests.id, id));
  await audit(db, actor, { action: "contact.status_changed", entityType: "contact_request", entityId: id, summary: `Contact request marked ${status}` });
}

export async function organisationDetail(db: DbOrTx, actor: Actor, organisationId: string) {
  requirePlatform(actor, "platform.view_all");
  const org = await db.query.organisations.findFirst({ where: eq(organisations.id, organisationId) });
  if (!org) throw new NotFoundError("Organisation not found");
  const members = await db
    .select({ m: organisationMemberships, name: users.name, email: users.email })
    .from(organisationMemberships)
    .innerJoin(users, eq(users.id, organisationMemberships.userId))
    .where(eq(organisationMemberships.organisationId, organisationId));
  return { org, members };
}
