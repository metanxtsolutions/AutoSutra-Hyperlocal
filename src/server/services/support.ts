import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "../db/client";
import { organisations, supportTicketMessages, supportTickets, users } from "../db/schema";
import { audit } from "../audit";
import { hasPlatform, requireOrg, requirePlatform, type Actor } from "../auth/context";
import { NotFoundError } from "../errors";
import { parse, requiredText } from "../validation";
import { notify } from "./notifications";

const ticketSchema = z.object({
  subject: requiredText("Subject", 200),
  body: requiredText("Description", 5000),
  category: z.enum(["general", "campaign", "billing", "wallet", "account", "data_request", "bug"]).default("general"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

export async function createTicket(db: Database, actor: Actor, organisationId: string, input: unknown) {
  requireOrg(actor, organisationId, "support.use");
  const data = parse(ticketSchema, input);
  return db.transaction(async (tx) => {
    const [t] = await tx.insert(supportTickets).values({ organisationId, createdById: actor.user.id, ...data }).returning();
    await audit(tx, actor, { action: "support.ticket_created", entityType: "support_ticket", entityId: t.id, organisationId, summary: `Ticket: ${data.subject}` });
    await notify(tx, { organisationId: null, audience: "platform", kind: "support_ticket", severity: data.priority === "urgent" ? "critical" : "info", title: `New ${data.category.replace("_", " ")} ticket`, body: data.subject, link: `/admin/support/${t.id}`, dedupeKey: `ticket:${t.id}` });
    return t;
  });
}

async function loadTicket(db: DbOrTx, actor: Actor, id: string) {
  const t = await db.query.supportTickets.findFirst({ where: eq(supportTickets.id, id) });
  if (!t) throw new NotFoundError("Ticket not found");
  if (!hasPlatform(actor, "platform.view_all")) requireOrg(actor, t.organisationId, "support.use");
  return t;
}

export async function getTicket(db: DbOrTx, actor: Actor, id: string) {
  const t = await loadTicket(db, actor, id);
  const staff = hasPlatform(actor, "platform.view_all");
  const messages = await db
    .select({ m: supportTicketMessages, author: users.name, authorIsStaff: users.platformRole })
    .from(supportTicketMessages)
    .innerJoin(users, eq(users.id, supportTicketMessages.authorId))
    .where(and(eq(supportTicketMessages.ticketId, id), staff ? undefined : eq(supportTicketMessages.internal, false)))
    .orderBy(asc(supportTicketMessages.createdAt));
  return { ticket: t, messages };
}

export async function replyToTicket(db: Database, actor: Actor, id: string, body: string, opts: { internal?: boolean; status?: string } = {}) {
  const t = await loadTicket(db, actor, id);
  const staff = hasPlatform(actor, "platform.view_all");
  const text = parse(z.object({ body: requiredText("Message", 5000) }), { body }).body;
  await db.transaction(async (tx) => {
    await tx.insert(supportTicketMessages).values({ ticketId: id, authorId: actor.user.id, body: text, internal: staff && !!opts.internal });
    const status = staff && opts.status && ["open", "in_progress", "waiting_on_customer", "resolved", "closed"].includes(opts.status) ? opts.status : staff ? t.status : "open";
    await tx.update(supportTickets).set({ status: status as typeof t.status, assignedToId: staff ? actor.user.id : t.assignedToId }).where(eq(supportTickets.id, id));
    if (staff && !opts.internal) await notify(tx, { organisationId: t.organisationId, kind: "support_reply", title: "AutoSutra replied to your ticket", body: t.subject, link: `/app/support/${id}`, dedupeKey: `ticket_reply:${id}:${Date.now()}` });
  });
}

export async function listOrgTickets(db: DbOrTx, actor: Actor, organisationId: string) {
  requireOrg(actor, organisationId, "support.use");
  return db.select().from(supportTickets).where(eq(supportTickets.organisationId, organisationId)).orderBy(desc(supportTickets.updatedAt));
}

export async function listAllTickets(db: DbOrTx, actor: Actor, openOnly = true) {
  requirePlatform(actor, "platform.view_all");
  return db
    .select({ t: supportTickets, organisationName: organisations.name })
    .from(supportTickets)
    .innerJoin(organisations, eq(organisations.id, supportTickets.organisationId))
    .where(openOnly ? inArray(supportTickets.status, ["open", "in_progress", "waiting_on_customer"]) : undefined)
    .orderBy(desc(supportTickets.updatedAt))
    .limit(300);
}
