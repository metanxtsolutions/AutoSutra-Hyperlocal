import { and, asc, count, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "../db/client";
import {
  advertisingConnections,
  dealerships,
  invitations,
  locations,
  membershipLocations,
  organisationMemberships,
  organisations,
  sessions,
  subscriptions,
  users,
} from "../db/schema";
import { audit } from "../audit";
import { requireOrg, requirePlatform, type Actor } from "../auth/context";
import { LOCATION_SCOPED_ROLES, ORG_ROLES, type OrgRole } from "../auth/permissions";
import { hashToken, randomToken } from "../crypto";
import { sendEmail } from "../email";
import { getEnv } from "../env";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { rateLimit } from "../rate-limit";
import { email, indianState, optionalGstin, optionalIndianPhone, optionalPan, parse, requiredText } from "../validation";

export const TERMS_VERSION = "2026-10-draft";

const orgSchema = z.object({
  name: requiredText("Organisation name", 160),
  type: z.enum(["independent_dealership", "dealer_group", "agency"], { errorMap: () => ({ message: "Choose an organisation type" }) }),
});

export async function createOrganisation(db: Database, actor: Actor, input: unknown) {
  const data = parse(orgSchema, input);
  if (!actor.user.emailVerified) throw new ForbiddenError("Verify your email address before creating an organisation");
  await rateLimit(db, `create-org:${actor.user.id}`, 5, 86400);
  return db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organisations)
      .values({ name: data.name, type: data.type, termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION })
      .returning();
    await tx.insert(organisationMemberships).values({ organisationId: org.id, userId: actor.user.id, role: "owner" });
    await audit(tx, actor, {
      action: "organisation.created",
      entityType: "organisation",
      entityId: org.id,
      organisationId: org.id,
      summary: `Created organisation ${org.name}`,
      data: { type: org.type, termsVersion: TERMS_VERSION },
    });
    return org;
  });
}

const businessSchema = z.object({
  legalName: requiredText("Registered business name", 200),
  gstin: optionalGstin,
  pan: optionalPan,
  billingEmail: email,
  billingAddress: requiredText("Billing address", 500),
  billingState: indianState,
  contactName: requiredText("Contact person", 120),
  contactPhone: optionalIndianPhone,
});

export async function updateBusinessDetails(db: Database, actor: Actor, organisationId: string, input: unknown) {
  requireOrg(actor, organisationId, "org.manage");
  const data = parse(businessSchema, input);
  if (data.gstin && data.pan && data.gstin.slice(2, 12) !== data.pan) {
    throw new ValidationError("The PAN embedded in the GSTIN does not match the PAN entered", { gstin: "Does not match PAN" });
  }
  await db.transaction(async (tx) => {
    const org = await tx.query.organisations.findFirst({ where: eq(organisations.id, organisationId) });
    if (!org) throw new NotFoundError("Organisation not found");
    const changesIdentity = org.gstin !== (data.gstin ?? null) || org.legalName !== data.legalName;
    await tx
      .update(organisations)
      .set({
        legalName: data.legalName,
        gstin: data.gstin ?? null,
        pan: data.pan ?? null,
        billingEmail: data.billingEmail,
        billingAddress: data.billingAddress,
        billingState: data.billingState,
        contactName: data.contactName,
        contactPhone: data.contactPhone ?? null,
        // Changing legal identity after verification sends the organisation back for review.
        verificationStatus: changesIdentity && org.verificationStatus === "verified" ? "pending" : org.verificationStatus === "unverified" ? "pending" : org.verificationStatus,
      })
      .where(eq(organisations.id, organisationId));
    await audit(tx, actor, {
      action: "organisation.business_details_updated",
      entityType: "organisation",
      entityId: organisationId,
      organisationId,
      summary: "Updated business and billing details",
      data: { legalName: data.legalName, gstin: data.gstin ?? null, billingState: data.billingState },
    });
  });
}

export async function requestManagedService(db: Database, actor: Actor, organisationId: string, requested: boolean) {
  requireOrg(actor, organisationId, "org.manage");
  await db.transaction(async (tx) => {
    await tx.update(organisations).set({ managedServiceRequested: requested }).where(eq(organisations.id, organisationId));
    await audit(tx, actor, {
      action: requested ? "organisation.managed_service_requested" : "organisation.managed_service_request_withdrawn",
      entityType: "organisation",
      entityId: organisationId,
      organisationId,
      summary: requested ? "Requested AutoSutra managed campaign service" : "Withdrew managed service request",
    });
  });
}

export async function getOrganisation(db: DbOrTx, actor: Actor, organisationId: string) {
  requireOrg(actor, organisationId, "dealership.view");
  const org = await db.query.organisations.findFirst({ where: eq(organisations.id, organisationId) });
  if (!org) throw new NotFoundError("Not found");
  return org;
}

export async function listMyOrganisations(db: DbOrTx, userId: string) {
  return db
    .select({ id: organisations.id, name: organisations.name, role: organisationMemberships.role, status: organisations.status })
    .from(organisationMemberships)
    .innerJoin(organisations, eq(organisations.id, organisationMemberships.organisationId))
    .where(eq(organisationMemberships.userId, userId))
    .orderBy(asc(organisations.name));
}

// ------------------------------------------------------------------ onboarding

export interface OnboardingStep {
  key: string;
  label: string;
  done: boolean;
  href: string;
  detail: string;
}

export async function onboardingStatus(db: DbOrTx, actor: Actor): Promise<OnboardingStep[]> {
  const m = actor.membership;
  const orgId = m?.organisationId;
  const org = orgId ? await db.query.organisations.findFirst({ where: eq(organisations.id, orgId) }) : null;
  const [dealerCount] = orgId ? await db.select({ n: count() }).from(dealerships).where(eq(dealerships.organisationId, orgId)) : [{ n: 0 }];
  const [locationCount] = orgId ? await db.select({ n: count() }).from(locations).where(eq(locations.organisationId, orgId)) : [{ n: 0 }];
  const sub = orgId ? await db.query.subscriptions.findFirst({ where: and(eq(subscriptions.organisationId, orgId), inArray(subscriptions.status, ["trialing", "active", "past_due"])) }) : null;
  const connections = orgId ? await db.select().from(advertisingConnections).where(eq(advertisingConnections.organisationId, orgId)) : [];
  const connected = connections.some((c) => c.status === "connected");
  return [
    { key: "account", label: "Create account", done: true, href: "/app/account", detail: actor.user.emailVerified ? "Email verified" : "Verify your email address to continue" },
    { key: "verify", label: "Verify email", done: actor.user.emailVerified, href: "/verify-email", detail: actor.user.emailVerified ? "Done" : "Check your inbox for the verification link" },
    { key: "organisation", label: "Create organisation", done: !!org, href: "/app/onboarding/organisation", detail: org ? org.name : "Name your dealership business or group" },
    { key: "business", label: "Business details", done: !!org?.legalName && !!org?.billingEmail, href: "/app/settings/organisation", detail: org?.legalName ? `${org.legalName}${org.gstin ? ` · GSTIN ${org.gstin}` : ""}` : "Legal name, GSTIN, billing contact" },
    { key: "dealership", label: "Add first dealership", done: dealerCount.n > 0, href: "/app/dealerships/new", detail: `${dealerCount.n} dealership(s)` },
    { key: "location", label: "Add a showroom location", done: locationCount.n > 0, href: "/app/dealerships", detail: `${locationCount.n} location(s)` },
    { key: "subscription", label: "Choose a subscription", done: !!sub, href: "/app/billing", detail: sub ? `Status: ${sub.status}` : "Start a trial or choose a plan" },
    {
      key: "advertising",
      label: "Connect ad accounts or request managed service",
      done: connected || !!org?.managedServiceRequested,
      href: "/app/settings/connections",
      detail: connected ? "Ad account connected" : org?.managedServiceRequested ? "Managed service requested" : "Connect Meta / Google, or ask AutoSutra to manage campaigns",
    },
  ];
}

// ------------------------------------------------------------------ team

export async function listTeam(db: DbOrTx, actor: Actor, organisationId: string) {
  requireOrg(actor, organisationId, "dealership.view");
  const members = await db
    .select({ membership: organisationMemberships, user: { id: users.id, name: users.name, email: users.email, status: users.status } })
    .from(organisationMemberships)
    .innerJoin(users, eq(users.id, organisationMemberships.userId))
    .where(eq(organisationMemberships.organisationId, organisationId))
    .orderBy(asc(users.name));
  const ids = members.map((m) => m.membership.id);
  const locs = ids.length ? await db.select().from(membershipLocations).where(inArray(membershipLocations.membershipId, ids)) : [];
  const pending = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.organisationId, organisationId), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())));
  return {
    members: members.map((m) => ({ ...m, locationIds: locs.filter((l) => l.membershipId === m.membership.id).map((l) => l.locationId) })),
    pending,
  };
}

const inviteSchema = z.object({ email, role: z.enum(ORG_ROLES) });

export async function inviteMember(db: Database, actor: Actor, organisationId: string, input: unknown) {
  requireOrg(actor, organisationId, "team.manage");
  const data = parse(inviteSchema, input);
  if (data.role === "owner" && actor.membership?.role !== "owner") throw new ForbiddenError("Only an owner can invite another owner");
  await rateLimit(db, `invite:${organisationId}`, 50, 86400);
  const token = randomToken();
  await db.transaction(async (tx) => {
    const existingUser = await tx.query.users.findFirst({ where: sql`lower(${users.email}) = ${data.email}` });
    if (existingUser) {
      const already = await tx.query.organisationMemberships.findFirst({
        where: and(eq(organisationMemberships.organisationId, organisationId), eq(organisationMemberships.userId, existingUser.id)),
      });
      if (already) throw new ConflictError("This person is already a member");
    }
    const org = await tx.query.organisations.findFirst({ where: eq(organisations.id, organisationId) });
    await tx.insert(invitations).values({
      organisationId,
      email: data.email,
      role: data.role,
      tokenHash: hashToken(token),
      invitedById: actor.user.id,
      expiresAt: new Date(Date.now() + 7 * 86400_000),
    });
    const link = `${getEnv().APP_URL}/invite?token=${encodeURIComponent(token)}`;
    await sendEmail(tx, data.email, `You have been invited to ${org?.name} on AutoSutra`, `${actor.user.name} invited you to join ${org?.name} on AutoSutra as ${data.role.replace("_", " ")}.\n\nAccept the invitation (sign in or create an account with this email address):\n${link}\n\nThe invitation expires in 7 days.`);
    await audit(tx, actor, { action: "team.invited", entityType: "invitation", organisationId, summary: `Invited ${data.email} as ${data.role}`, data });
  });
  return token;
}

export async function acceptInvitation(db: Database, actor: Actor, token: string) {
  return db.transaction(async (tx) => {
    const inv = await tx.query.invitations.findFirst({
      where: and(eq(invitations.tokenHash, hashToken(token)), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())),
    });
    if (!inv) throw new ValidationError("This invitation is invalid or has expired");
    if (inv.email.toLowerCase() !== actor.user.email.toLowerCase()) {
      throw new ForbiddenError(`This invitation was sent to ${inv.email}. Sign in with that address to accept it.`);
    }
    if (!actor.user.emailVerified) throw new ForbiddenError("Verify your email address first");
    await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, inv.id));
    await tx
      .insert(organisationMemberships)
      .values({ organisationId: inv.organisationId, userId: actor.user.id, role: inv.role })
      .onConflictDoNothing();
    await audit(tx, actor, { action: "team.joined", entityType: "organisation", entityId: inv.organisationId, organisationId: inv.organisationId, summary: `${actor.user.email} joined as ${inv.role}` });
    return inv.organisationId;
  });
}

const memberUpdateSchema = z.object({
  role: z.enum(ORG_ROLES),
  allLocations: z.boolean(),
  locationIds: z.array(z.string().uuid()).default([]),
});

export async function updateMember(db: Database, actor: Actor, organisationId: string, membershipId: string, input: unknown) {
  requireOrg(actor, organisationId, "team.manage");
  const data = parse(memberUpdateSchema, input);
  await db.transaction(async (tx) => {
    const m = await tx.query.organisationMemberships.findFirst({
      where: and(eq(organisationMemberships.id, membershipId), eq(organisationMemberships.organisationId, organisationId)),
    });
    if (!m) throw new NotFoundError("Member not found");
    if ((m.role === "owner" || data.role === "owner") && actor.membership?.role !== "owner") {
      throw new ForbiddenError("Only an owner can change owner access");
    }
    if (m.role === "owner" && data.role !== "owner") await assertAnotherOwner(tx, organisationId, m.id);
    const allLocations = LOCATION_SCOPED_ROLES.includes(data.role as OrgRole) ? data.allLocations : true;
    if (!allLocations && data.locationIds.length === 0) throw new ValidationError("Choose at least one location for location-limited access");
    if (data.locationIds.length) {
      const valid = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.organisationId, organisationId), inArray(locations.id, data.locationIds)));
      if (valid.length !== data.locationIds.length) throw new ValidationError("A selected location does not belong to this organisation");
    }
    await tx.update(organisationMemberships).set({ role: data.role, allLocations }).where(eq(organisationMemberships.id, m.id));
    await tx.delete(membershipLocations).where(eq(membershipLocations.membershipId, m.id));
    if (!allLocations) {
      await tx.insert(membershipLocations).values(data.locationIds.map((locationId) => ({ membershipId: m.id, locationId })));
    }
    await audit(tx, actor, {
      action: "team.member_updated",
      entityType: "membership",
      entityId: m.id,
      organisationId,
      summary: `Changed role ${m.role} → ${data.role}${allLocations ? "" : ` (limited to ${data.locationIds.length} location(s))`}`,
      data: { from: m.role, to: data.role, allLocations, locationIds: data.locationIds },
    });
  });
}

async function assertAnotherOwner(tx: DbOrTx, organisationId: string, excludingMembershipId: string) {
  const [row] = await tx
    .select({ n: count() })
    .from(organisationMemberships)
    .where(and(eq(organisationMemberships.organisationId, organisationId), eq(organisationMemberships.role, "owner"), sql`${organisationMemberships.id} <> ${excludingMembershipId}`));
  if (row.n === 0) throw new ValidationError("An organisation must keep at least one owner");
}

export async function removeMember(db: Database, actor: Actor, organisationId: string, membershipId: string) {
  requireOrg(actor, organisationId, "team.manage");
  await db.transaction(async (tx) => {
    const m = await tx.query.organisationMemberships.findFirst({
      where: and(eq(organisationMemberships.id, membershipId), eq(organisationMemberships.organisationId, organisationId)),
    });
    if (!m) throw new NotFoundError("Member not found");
    if (m.role === "owner") {
      if (actor.membership?.role !== "owner") throw new ForbiddenError("Only an owner can remove an owner");
      await assertAnotherOwner(tx, organisationId, m.id);
    }
    await tx.delete(organisationMemberships).where(eq(organisationMemberships.id, m.id));
    await tx.update(sessions).set({ activeOrganisationId: null }).where(and(eq(sessions.userId, m.userId), eq(sessions.activeOrganisationId, organisationId)));
    await audit(tx, actor, { action: "team.member_removed", entityType: "membership", entityId: m.id, organisationId, summary: `Removed member (${m.role})`, data: { userId: m.userId } });
  });
}

// ------------------------------------------------------------------ platform administration

export async function listAllOrganisations(db: DbOrTx, actor: Actor) {
  requirePlatform(actor, "platform.view_all");
  return db.select().from(organisations).orderBy(asc(organisations.name));
}

export async function setVerification(db: Database, actor: Actor, organisationId: string, status: "verified" | "rejected" | "pending", note: string) {
  requirePlatform(actor, "platform.admin");
  if (status === "rejected" && !note.trim()) throw new ValidationError("Give a reason for rejecting verification");
  await db.transaction(async (tx) => {
    await tx.update(organisations).set({ verificationStatus: status, verificationNote: note.trim() || null }).where(eq(organisations.id, organisationId));
    await audit(tx, actor, { action: "organisation.verification_changed", entityType: "organisation", entityId: organisationId, organisationId, summary: `Verification set to ${status}${note ? `: ${note}` : ""}` });
  });
}

export async function setSuspended(db: Database, actor: Actor, organisationId: string, suspended: boolean, reason: string) {
  requirePlatform(actor, "platform.admin");
  if (!reason.trim()) throw new ValidationError("A reason is required");
  await db.transaction(async (tx) => {
    await tx
      .update(organisations)
      .set({ status: suspended ? "suspended" : "active", suspendedReason: suspended ? reason.trim() : null })
      .where(eq(organisations.id, organisationId));
    await audit(tx, actor, {
      action: suspended ? "organisation.suspended" : "organisation.reinstated",
      entityType: "organisation",
      entityId: organisationId,
      organisationId,
      summary: `${suspended ? "Suspended" : "Reinstated"}: ${reason.trim()}`,
    });
  });
}

export async function setManagedServiceActive(db: Database, actor: Actor, organisationId: string, active: boolean) {
  requirePlatform(actor, "platform.campaign_ops");
  await db.transaction(async (tx) => {
    await tx.update(organisations).set({ managedServiceActive: active }).where(eq(organisations.id, organisationId));
    await audit(tx, actor, { action: "organisation.managed_service_changed", entityType: "organisation", entityId: organisationId, organisationId, summary: `Managed service ${active ? "activated" : "deactivated"}` });
  });
}
