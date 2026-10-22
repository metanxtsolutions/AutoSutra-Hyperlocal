import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { membershipLocations, organisationMemberships, organisations, users } from "../db/schema";
import { ForbiddenError, NotFoundError } from "../errors";
import {
  platformRoleHas,
  roleHas,
  type OrgPermission,
  type OrgRole,
  type PlatformPermission,
  type PlatformRole,
} from "./permissions";

export interface ActorUser {
  id: string;
  name: string;
  email: string;
  platformRole: PlatformRole | null;
  emailVerified: boolean;
}

export interface ActorMembership {
  id: string;
  organisationId: string;
  organisationName: string;
  role: OrgRole;
  allLocations: boolean;
  locationIds: string[];
}

/** Who is acting. Passed to every service call; never built from client input. */
export interface Actor {
  user: ActorUser;
  membership: ActorMembership | null;
  /** The current session passed two-step verification. */
  mfaVerified: boolean;
  ip?: string | null;
}

/** System actor for background jobs and verified webhooks. */
export interface SystemActor {
  system: string;
}

export type AnyActor = Actor | SystemActor;

export function isSystem(actor: AnyActor): actor is SystemActor {
  return "system" in actor;
}

export async function loadActor(
  db: DbOrTx,
  userId: string,
  organisationId: string | null,
  ip?: string | null,
  opts: { mfaVerified?: boolean } = {},
): Promise<Actor | null> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user || user.status !== "active") return null;
  let membership: ActorMembership | null = null;
  const memberships = await db
    .select({ m: organisationMemberships, orgName: organisations.name, orgStatus: organisations.status })
    .from(organisationMemberships)
    .innerJoin(organisations, eq(organisations.id, organisationMemberships.organisationId))
    .where(eq(organisationMemberships.userId, userId));
  const chosen = memberships.find((m) => m.m.organisationId === organisationId) ?? memberships[0];
  if (chosen && chosen.orgStatus === "active") {
    const locs = chosen.m.allLocations
      ? []
      : (
          await db
            .select({ id: membershipLocations.locationId })
            .from(membershipLocations)
            .where(eq(membershipLocations.membershipId, chosen.m.id))
        ).map((r) => r.id);
    membership = {
      id: chosen.m.id,
      organisationId: chosen.m.organisationId,
      organisationName: chosen.orgName,
      role: chosen.m.role,
      allLocations: chosen.m.allLocations,
      locationIds: locs,
    };
  }
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      platformRole: user.platformRole,
      emailVerified: !!user.emailVerifiedAt,
    },
    membership,
    mfaVerified: !!opts.mfaVerified,
    ip,
  };
}

export function hasPlatform(actor: Actor, permission: PlatformPermission): boolean {
  return platformRoleHas(actor.user.platformRole, permission);
}

/** Raised when an action needs a session that passed two-step verification. */
export class TwoStepRequiredError extends ForbiddenError {}

const TWO_STEP_MESSAGE = "Turn on two-step verification (Account, Two-step verification) and sign in with it to do this.";

export function requirePlatform(actor: Actor, permission: PlatformPermission): void {
  if (!hasPlatform(actor, permission)) throw new ForbiddenError("This action needs AutoSutra staff permissions");
  if (!actor.mfaVerified) throw new TwoStepRequiredError(TWO_STEP_MESSAGE);
}

/** Organisation permissions that move money, so they need a two-step verified session. */
const TWO_STEP_ORG_PERMISSIONS: readonly OrgPermission[] = ["wallet.deposit", "wallet.refund_request"];

/** Platform permission that substitutes for an organisation permission when staff act on a tenant. */
const STAFF_EQUIVALENT: Partial<Record<OrgPermission, PlatformPermission>> = {
  "dealership.view": "platform.view_all",
  "campaign.view": "platform.view_all",
  "campaign.publish": "platform.campaign_ops",
  "campaign.pause": "platform.campaign_ops",
  "campaign.edit": "platform.campaign_ops",
  "lead.view": "platform.view_all",
  "reports.view": "platform.view_all",
  "wallet.view": "platform.view_all",
  "billing.view": "platform.view_all",
  "dealership.manage": "platform.admin",
  "location.manage": "platform.admin",
  "org.manage": "platform.admin",
};

export function can(actor: Actor, organisationId: string, permission: OrgPermission): boolean {
  if (actor.membership?.organisationId === organisationId && roleHas(actor.membership.role, permission)) return true;
  const staff = STAFF_EQUIVALENT[permission];
  return !!staff && hasPlatform(actor, staff) && actor.mfaVerified;
}

/**
 * Throws unless the actor holds `permission` in `organisationId`.
 * Actors with no relationship to the organisation get NotFound, so other
 * tenants' records are indistinguishable from records that do not exist.
 */
export function requireOrg(actor: Actor, organisationId: string, permission: OrgPermission): void {
  if (can(actor, organisationId, permission)) {
    if (TWO_STEP_ORG_PERMISSIONS.includes(permission) && !actor.mfaVerified) throw new TwoStepRequiredError(TWO_STEP_MESSAGE);
    return;
  }
  const staff = STAFF_EQUIVALENT[permission];
  if (staff && hasPlatform(actor, staff) && !actor.mfaVerified) throw new TwoStepRequiredError(TWO_STEP_MESSAGE);
  const related = actor.membership?.organisationId === organisationId || hasPlatform(actor, "platform.view_all");
  if (!related) throw new NotFoundError("Not found");
  throw new ForbiddenError("Your role does not allow this action");
}

/** The actor's own organisation, or an error if they have none. */
export function requireMembership(actor: Actor): ActorMembership {
  if (!actor.membership) throw new ForbiddenError("Create or join an organisation first");
  return actor.membership;
}

/** Location filter for the actor within an org: null = all locations. */
export function locationScope(actor: Actor, organisationId: string): string[] | null {
  if (actor.membership?.organisationId === organisationId) {
    return actor.membership.allLocations ? null : actor.membership.locationIds;
  }
  return null; // platform staff (permission already checked)
}

export function requireLocation(actor: Actor, organisationId: string, locationId: string | null | undefined): void {
  const scope = locationScope(actor, organisationId);
  if (scope === null) return;
  if (!locationId || !scope.includes(locationId)) throw new NotFoundError("Not found");
}

export async function getMembershipRole(db: DbOrTx, organisationId: string, userId: string): Promise<OrgRole | null> {
  const row = await db.query.organisationMemberships.findFirst({
    where: and(eq(organisationMemberships.organisationId, organisationId), eq(organisationMemberships.userId, userId)),
  });
  return row?.role ?? null;
}

export function actorLabel(actor: AnyActor): string {
  return isSystem(actor) ? `system:${actor.system}` : `${actor.user.name} <${actor.user.email}>`;
}
