/**
 * Lead centre.
 *
 * Personal data here belongs to the dealership (data fiduciary); AutoSutra
 * processes it on their behalf. Every captured lead carries a consent record
 * with the exact notice shown; withdrawing consent or deleting a lead
 * anonymises the personal fields while keeping non-identifying counts for
 * reporting. Access follows location scope, and exports are audited.
 */
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "../db/client";
import { campaigns, consentRecords, dealerships, leadActivities, leads, locations, organisationMemberships, users } from "../db/schema";
import { audit } from "../audit";
import { can, locationScope, requireLocation, requireOrg, type Actor, type AnyActor } from "../auth/context";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { getSetting } from "../flags";
import { rateLimit } from "../rate-limit";
import { email as emailSchema, optionalText, parse } from "../validation";
import { notify } from "./notifications";

export const LEAD_STATUSES = [
  "new", "assigned", "contacted", "follow_up_required", "qualified", "test_drive_scheduled",
  "test_drive_completed", "booking", "sold", "lost", "invalid",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type Lead = typeof leads.$inferSelect;

export const CONSENT_NOTICE_VERSION = "2026-10-v1";
export function consentNotice(dealershipName: string) {
  return `I agree that ${dealershipName} may contact me by phone, SMS, WhatsApp or email about my enquiry and related offers. I can withdraw this consent at any time. AutoSutra processes this information on ${dealershipName}'s behalf.`;
}

const DUPLICATE_WINDOW_DAYS = 30;

export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? `+91${ten}` : null;
}

// ------------------------------------------------------------------ capture

interface CaptureInput {
  organisationId: string;
  dealershipId: string;
  locationId?: string | null;
  campaignId?: string | null;
  provider?: "meta" | "google" | null;
  source: Lead["source"];
  externalId?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  message?: string | null;
  consent: { granted: boolean; noticeText: string; noticeVersion: string; source: string; ip?: string | null };
  createdAt?: Date;
}

/** Shared by every capture path. Idempotent on (organisation, source, externalId). */
export async function captureLead(db: DbOrTx, actor: AnyActor, input: CaptureInput) {
  const phoneNormalized = normalisePhone(input.phone);
  if (!phoneNormalized && !input.email) throw new ValidationError("A valid mobile number or email address is required");
  if (input.externalId) {
    const existing = await db.query.leads.findFirst({ where: and(eq(leads.organisationId, input.organisationId), eq(leads.source, input.source), eq(leads.externalId, input.externalId)) });
    if (existing) return { lead: existing, duplicate: true, created: false };
  }
  const since = new Date(Date.now() - DUPLICATE_WINDOW_DAYS * 86_400_000);
  const match = await db.query.leads.findFirst({
    where: and(
      eq(leads.organisationId, input.organisationId),
      isNull(leads.duplicateOfId),
      isNull(leads.anonymisedAt),
      gte(leads.createdAt, since),
      or(phoneNormalized ? eq(leads.phoneNormalized, phoneNormalized) : undefined, input.email ? eq(leads.email, input.email.toLowerCase()) : undefined),
    ),
    orderBy: desc(leads.createdAt),
  });
  const location = input.locationId ? await db.query.locations.findFirst({ where: eq(locations.id, input.locationId) }) : null;
  const assignee = match ? match.assignedToId : location?.leadRoutingUserId ?? null;
  const [lead] = await db
    .insert(leads)
    .values({
      organisationId: input.organisationId,
      dealershipId: input.dealershipId,
      locationId: input.locationId ?? null,
      campaignId: input.campaignId ?? null,
      provider: input.provider ?? null,
      source: input.source,
      externalId: input.externalId ?? null,
      name: input.name?.trim().slice(0, 120) || null,
      phone: input.phone?.trim() || null,
      phoneNormalized,
      email: input.email?.trim().toLowerCase() || null,
      vehicleBrand: input.vehicleBrand ?? null,
      vehicleModel: input.vehicleModel ?? null,
      message: input.message?.slice(0, 2000) ?? null,
      consentGiven: input.consent.granted,
      status: match ? "invalid" : assignee ? "assigned" : "new",
      assignedToId: assignee,
      duplicateOfId: match?.id ?? null,
      createdAt: input.createdAt ?? new Date(),
    })
    .returning();
  await db.insert(consentRecords).values({
    organisationId: input.organisationId,
    leadId: lead.id,
    purpose: "contact_about_enquiry",
    granted: input.consent.granted,
    noticeVersion: input.consent.noticeVersion,
    noticeText: input.consent.noticeText,
    source: input.consent.source,
    ip: input.consent.ip ?? null,
  });
  await db.insert(leadActivities).values({
    leadId: lead.id,
    actorId: "user" in actor ? actor.user.id : null,
    kind: "created",
    toStatus: lead.status,
    body: match ? `Duplicate of an enquiry received ${match.createdAt.toISOString().slice(0, 10)}` : `Captured from ${input.source.replace(/_/g, " ")}`,
  });
  if (match) {
    await db.insert(leadActivities).values({ leadId: match.id, kind: "note", body: `Same person enquired again via ${input.source.replace(/_/g, " ")}${input.message ? `: ${input.message.slice(0, 300)}` : ""}` });
  } else {
    await notify(db, {
      organisationId: input.organisationId,
      kind: "new_lead",
      title: "New enquiry",
      body: `${lead.name ?? "A customer"}${lead.vehicleModel ? ` is interested in ${lead.vehicleModel}` : ""}${location ? ` at ${location.name}` : ""}.`,
      link: `/app/leads/${lead.id}`,
      dedupeKey: `new_lead:${lead.id}`,
    });
  }
  return { lead, duplicate: !!match, created: true };
}

const publicSchema = z.object({
  locationId: z.string().uuid(),
  campaignId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  name: z.string().trim().min(1, "Enter your name").max(120),
  phone: z.string().trim().refine((v) => !!normalisePhone(v), "Enter a valid Indian mobile number"),
  email: z.preprocess((v) => (v === "" ? undefined : v), emailSchema.optional()),
  vehicleModel: optionalText(80),
  message: optionalText(1000),
  kind: z.enum(["website_form", "test_drive_form"]).default("website_form"),
  consent: z.literal(true, { errorMap: () => ({ message: "Please agree to be contacted so the dealership can respond" }) }),
  website: z.string().max(0).optional(), // honeypot
});

/** Public enquiry and test-drive forms hosted by AutoSutra for each location. */
export async function submitPublicEnquiry(db: Database, input: unknown, ip: string | null) {
  const data = parse(publicSchema, input);
  await rateLimit(db, `enquiry:${ip ?? "unknown"}`, 10, 3600);
  const location = await db.query.locations.findFirst({ where: and(eq(locations.id, data.locationId), eq(locations.status, "active")) });
  if (!location) throw new NotFoundError("This enquiry form is no longer available");
  const dealership = await db.query.dealerships.findFirst({ where: eq(dealerships.id, location.dealershipId) });
  if (!dealership || dealership.status !== "active") throw new NotFoundError("This enquiry form is no longer available");
  if (data.campaignId) {
    const c = await db.query.campaigns.findFirst({ where: and(eq(campaigns.id, data.campaignId), eq(campaigns.organisationId, location.organisationId)) });
    if (!c) data.campaignId = undefined;
  }
  return db.transaction((tx) =>
    captureLead(tx, { system: "public-form" }, {
      organisationId: location.organisationId,
      dealershipId: location.dealershipId,
      locationId: location.id,
      campaignId: data.campaignId ?? null,
      source: data.kind,
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      vehicleModel: data.vehicleModel ?? null,
      message: data.message ?? null,
      consent: { granted: true, noticeText: consentNotice(dealership.name), noticeVersion: CONSENT_NOTICE_VERSION, source: data.kind, ip },
    }),
  );
}

const manualSchema = z.object({
  locationId: z.string().uuid("Choose a location"),
  campaignId: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  source: z.enum(["manual_upload", "phone_call", "whatsapp_click", "crm_import"]),
  name: optionalText(120),
  phone: optionalText(20),
  email: z.preprocess((v) => (v === "" ? undefined : v), emailSchema.optional()),
  vehicleBrand: optionalText(60),
  vehicleModel: optionalText(80),
  message: optionalText(2000),
  consentConfirmed: z.literal(true, { errorMap: () => ({ message: "Confirm the customer consented to be contacted" }) }),
  consentSource: z.string().trim().min(3, "Describe how consent was obtained").max(300),
});

export async function createManualLead(db: Database, actor: Actor, organisationId: string, input: unknown) {
  requireOrg(actor, organisationId, "lead.manage");
  const data = parse(manualSchema, input);
  const loc = await db.query.locations.findFirst({ where: and(eq(locations.id, data.locationId), eq(locations.organisationId, organisationId)) });
  if (!loc) throw new ValidationError("Location not found");
  requireLocation(actor, organisationId, loc.id);
  return db.transaction(async (tx) => {
    const r = await captureLead(tx, actor, {
      organisationId,
      dealershipId: loc.dealershipId,
      locationId: loc.id,
      campaignId: data.campaignId ?? null,
      source: data.source,
      name: data.name,
      phone: data.phone,
      email: data.email,
      vehicleBrand: data.vehicleBrand,
      vehicleModel: data.vehicleModel,
      message: data.message,
      consent: { granted: true, noticeText: `Consent recorded by ${actor.user.name}: ${data.consentSource}`, noticeVersion: "manual", source: data.source },
    });
    await audit(tx, actor, { action: "lead.created", entityType: "lead", entityId: r.lead.id, organisationId, summary: `Added ${data.source.replace("_", " ")} lead${r.duplicate ? " (duplicate detected)" : ""}` });
    return r;
  });
}

/** CSV import: name, phone, email, vehicle_model, message, consent_source. Each row needs consent evidence. */
export async function importLeadsCsv(db: Database, actor: Actor, organisationId: string, locationId: string, csv: string) {
  requireOrg(actor, organisationId, "lead.manage");
  const loc = await db.query.locations.findFirst({ where: and(eq(locations.id, locationId), eq(locations.organisationId, organisationId)) });
  if (!loc) throw new ValidationError("Location not found");
  requireLocation(actor, organisationId, loc.id);
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new ValidationError("The file has no data rows");
  if (rows.length > 2001) throw new ValidationError("Import up to 2,000 rows at a time");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col("phone") < 0 && col("email") < 0) throw new ValidationError("The CSV needs a phone or email column");
  if (col("consent_source") < 0) throw new ValidationError("The CSV needs a consent_source column describing how each person consented");
  const result = { created: 0, duplicates: 0, skipped: [] as string[] };
  await db.transaction(async (tx) => {
    for (const [i, r] of rows.slice(1).entries()) {
      const get = (n: string) => (col(n) >= 0 ? r[col(n)]?.trim() || null : null);
      if (!get("consent_source")) {
        result.skipped.push(`Row ${i + 2}: missing consent_source`);
        continue;
      }
      try {
        const out = await captureLead(tx, actor, {
          organisationId,
          dealershipId: loc.dealershipId,
          locationId: loc.id,
          source: "manual_upload",
          name: get("name"),
          phone: get("phone"),
          email: get("email"),
          vehicleModel: get("vehicle_model"),
          message: get("message"),
          consent: { granted: true, noticeText: `Imported by ${actor.user.name}: ${get("consent_source")}`, noticeVersion: "import", source: "manual_upload" },
        });
        if (out.duplicate) result.duplicates++;
        else result.created++;
      } catch (e) {
        result.skipped.push(`Row ${i + 2}: ${e instanceof Error ? e.message : "invalid"}`);
      }
    }
    await audit(tx, actor, { action: "lead.imported", entityType: "location", entityId: loc.id, organisationId, summary: `Imported ${result.created} lead(s), ${result.duplicates} duplicate(s), ${result.skipped.length} skipped` });
  });
  return result;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

// ------------------------------------------------------------------ queries

export interface LeadFilter {
  status?: string;
  locationId?: string;
  campaignId?: string;
  source?: string;
  assignedToId?: string;
  q?: string;
  from?: string;
  to?: string;
  includeDuplicates?: boolean;
}

function filterSql(actor: Actor, organisationId: string, f: LeadFilter): SQL[] {
  const c: SQL[] = [eq(leads.organisationId, organisationId)];
  const scope = locationScope(actor, organisationId);
  if (scope !== null) c.push(inArray(leads.locationId, scope.length ? scope : ["00000000-0000-0000-0000-000000000000"]));
  if (f.status && (LEAD_STATUSES as readonly string[]).includes(f.status)) c.push(eq(leads.status, f.status as LeadStatus));
  if (f.locationId) c.push(eq(leads.locationId, f.locationId));
  if (f.campaignId) c.push(eq(leads.campaignId, f.campaignId));
  if (f.source) c.push(eq(leads.source, f.source as Lead["source"]));
  if (f.assignedToId) c.push(f.assignedToId === "unassigned" ? isNull(leads.assignedToId) : eq(leads.assignedToId, f.assignedToId));
  if (f.q) c.push(or(ilike(leads.name, `%${f.q}%`), ilike(leads.phone, `%${f.q}%`), ilike(leads.email, `%${f.q}%`), ilike(leads.vehicleModel, `%${f.q}%`))!);
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) c.push(gte(leads.createdAt, new Date(`${f.from}T00:00:00+05:30`)));
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) c.push(lte(leads.createdAt, new Date(`${f.to}T23:59:59+05:30`)));
  if (!f.includeDuplicates) c.push(isNull(leads.duplicateOfId));
  return c;
}

export async function listLeads(db: DbOrTx, actor: Actor, organisationId: string, f: LeadFilter = {}, limit = 300) {
  requireOrg(actor, organisationId, "lead.view");
  return db
    .select({ lead: leads, locationName: locations.name, campaignName: campaigns.name, assigneeName: users.name })
    .from(leads)
    .leftJoin(locations, eq(locations.id, leads.locationId))
    .leftJoin(campaigns, eq(campaigns.id, leads.campaignId))
    .leftJoin(users, eq(users.id, leads.assignedToId))
    .where(and(...filterSql(actor, organisationId, f)))
    .orderBy(desc(leads.createdAt))
    .limit(limit);
}

export async function getLead(db: DbOrTx, actor: Actor, leadId: string) {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) throw new NotFoundError("Lead not found");
  requireOrg(actor, lead.organisationId, "lead.view");
  requireLocation(actor, lead.organisationId, lead.locationId);
  const [activities, consents, duplicates] = await Promise.all([
    db.select({ a: leadActivities, actorName: users.name }).from(leadActivities).leftJoin(users, eq(users.id, leadActivities.actorId)).where(eq(leadActivities.leadId, lead.id)).orderBy(asc(leadActivities.createdAt)),
    db.select().from(consentRecords).where(eq(consentRecords.leadId, lead.id)),
    db.select().from(leads).where(eq(leads.duplicateOfId, lead.id)),
  ]);
  return { lead, activities, consents, duplicates };
}

export async function assignableUsers(db: DbOrTx, actor: Actor, organisationId: string) {
  requireOrg(actor, organisationId, "lead.view");
  return db
    .select({ id: users.id, name: users.name, role: organisationMemberships.role })
    .from(organisationMemberships)
    .innerJoin(users, eq(users.id, organisationMemberships.userId))
    .where(and(eq(organisationMemberships.organisationId, organisationId), eq(users.status, "active")))
    .orderBy(asc(users.name));
}

// ------------------------------------------------------------------ updates

const updateSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  assignedToId: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable().optional()),
  note: optionalText(4000),
  testDriveAt: z.preprocess((v) => (v === "" ? undefined : v), z.string().datetime({ local: true, message: "Choose a valid date and time" }).optional()),
});

export async function updateLead(db: Database, actor: Actor, leadId: string, input: unknown) {
  const { lead } = await getLead(db, actor, leadId);
  requireOrg(actor, lead.organisationId, "lead.manage");
  if (lead.anonymisedAt) throw new ValidationError("This lead has been anonymised and cannot be changed");
  const data = parse(updateSchema, input);
  if (data.assignedToId !== undefined && data.assignedToId !== lead.assignedToId) {
    requireOrg(actor, lead.organisationId, "lead.assign");
    if (data.assignedToId) {
      const m = await db.query.organisationMemberships.findFirst({ where: and(eq(organisationMemberships.organisationId, lead.organisationId), eq(organisationMemberships.userId, data.assignedToId)) });
      if (!m) throw new ValidationError("Assignee is not a member of this organisation");
    }
  }
  if (data.status === "test_drive_scheduled" && !data.testDriveAt && !lead.testDriveAt) throw new ValidationError("Set the test-drive date and time", { testDriveAt: "Required" });
  await db.transaction(async (tx) => {
    const set: Partial<typeof leads.$inferInsert> = { updatedAt: new Date() };
    if (data.status && data.status !== lead.status) {
      set.status = data.status;
      if (!lead.firstResponseAt && !["new", "assigned", "invalid"].includes(data.status)) set.firstResponseAt = new Date();
      await tx.insert(leadActivities).values({ leadId: lead.id, actorId: actor.user.id, kind: "status_change", fromStatus: lead.status, toStatus: data.status, body: data.note ?? null });
    }
    if (data.assignedToId !== undefined && data.assignedToId !== lead.assignedToId) {
      set.assignedToId = data.assignedToId;
      if (lead.status === "new" && data.assignedToId && !set.status) set.status = "assigned";
      const name = data.assignedToId ? (await tx.query.users.findFirst({ where: eq(users.id, data.assignedToId) }))?.name : "nobody";
      await tx.insert(leadActivities).values({ leadId: lead.id, actorId: actor.user.id, kind: "assignment", body: `Assigned to ${name}` });
    }
    if (data.testDriveAt) {
      set.testDriveAt = new Date(`${data.testDriveAt}+05:30`);
      await tx.insert(leadActivities).values({ leadId: lead.id, actorId: actor.user.id, kind: "note", body: `Test drive scheduled for ${data.testDriveAt.replace("T", " ")} IST` });
    }
    if (data.note && !(data.status && data.status !== lead.status)) {
      await tx.insert(leadActivities).values({ leadId: lead.id, actorId: actor.user.id, kind: "note", body: data.note });
      if (!lead.firstResponseAt) set.firstResponseAt = new Date();
    }
    await tx.update(leads).set(set).where(eq(leads.id, lead.id));
  });
}

/** Removes personal data, keeping the non-identifying record for reporting. */
export async function anonymiseLead(db: DbOrTx, actor: AnyActor, leadId: string, reason: string) {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) throw new NotFoundError("Lead not found");
  if ("user" in actor) {
    requireOrg(actor, lead.organisationId, "lead.delete");
    requireLocation(actor, lead.organisationId, lead.locationId);
  }
  if (lead.anonymisedAt) return;
  await db.update(leads).set({ name: null, phone: null, phoneNormalized: null, email: null, message: null, anonymisedAt: new Date() }).where(eq(leads.id, lead.id));
  await db.update(consentRecords).set({ ip: null }).where(eq(consentRecords.leadId, lead.id));
  await db.insert(leadActivities).values({ leadId: lead.id, actorId: "user" in actor ? actor.user.id : null, kind: "anonymised", body: reason });
  await audit(db, actor, { action: "lead.anonymised", entityType: "lead", entityId: lead.id, organisationId: lead.organisationId, summary: `Personal data removed: ${reason}` });
}

export async function withdrawConsent(db: Database, actor: Actor, leadId: string) {
  const { lead } = await getLead(db, actor, leadId);
  requireOrg(actor, lead.organisationId, "lead.manage");
  await db.transaction(async (tx) => {
    await tx.update(consentRecords).set({ withdrawnAt: new Date() }).where(and(eq(consentRecords.leadId, lead.id), isNull(consentRecords.withdrawnAt)));
    await tx.update(leads).set({ consentGiven: false }).where(eq(leads.id, lead.id));
    await anonymiseLead(tx, { system: "consent-withdrawal" }, lead.id, `Consent withdrawn (recorded by ${actor.user.name})`);
  });
}

/** Retention: anonymise leads older than the organisation's retention period (default 2 years). */
export async function applyRetention(db: Database) {
  const days = await getSetting<number>(db, "lead_retention_days", 730);
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const old = await db.select({ id: leads.id }).from(leads).where(and(isNull(leads.anonymisedAt), lte(leads.createdAt, cutoff))).limit(1000);
  for (const l of old) await anonymiseLead(db, { system: "retention" }, l.id, `Retention period of ${days} days elapsed`);
  return old.length;
}

export async function exportLeadsCsvRows(db: DbOrTx, actor: Actor, organisationId: string, f: LeadFilter) {
  requireOrg(actor, organisationId, "lead.export");
  const rows = await listLeads(db, actor, organisationId, { ...f, includeDuplicates: true }, 10_000);
  await audit(db, actor, { action: "lead.exported", entityType: "organisation", entityId: organisationId, organisationId, summary: `Exported ${rows.length} lead(s) to CSV`, data: { filter: f } });
  return rows;
}

/** Can this actor see personal fields? Analysts and finance users cannot (they lack lead.view entirely). */
export function canSeeLeads(actor: Actor, organisationId: string) {
  return can(actor, organisationId, "lead.view");
}

export async function leadSummaryForAdmin(db: DbOrTx, actor: Actor) {
  if (!actor.user.platformRole) throw new ForbiddenError("Staff only");
  return db
    .select({ organisationId: leads.organisationId, total: sql<number>`count(*)`, newCount: sql<number>`count(*) filter (where ${leads.status} = 'new')`, sold: sql<number>`count(*) filter (where ${leads.status} = 'sold')` })
    .from(leads)
    .where(ne(leads.status, "invalid"))
    .groupBy(leads.organisationId);
}
