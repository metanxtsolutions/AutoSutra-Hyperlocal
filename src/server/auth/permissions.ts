/**
 * Role-based access control. The matrix lives in code (reviewed with the code
 * that depends on it) and is enforced only on the server.
 */

export const ORG_ROLES = [
  "owner",
  "admin",
  "marketing_manager",
  "branch_manager",
  "sales_user",
  "finance_user",
  "analyst",
] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const PLATFORM_ROLES = ["super_admin", "finance_admin", "campaign_ops"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const ORG_PERMISSIONS = [
  "org.manage",
  "team.manage",
  "dealership.view",
  "dealership.manage",
  "location.manage",
  "campaign.view",
  "campaign.edit",
  "campaign.submit",
  "campaign.approve",
  "campaign.publish",
  "campaign.pause",
  "lead.view",
  "lead.manage",
  "lead.assign",
  "lead.export",
  "lead.delete",
  "reports.view",
  "reports.export",
  "connections.manage",
  "wallet.view",
  "wallet.deposit",
  "wallet.refund_request",
  "billing.view",
  "billing.manage",
  "inventory.manage",
  "support.use",
] as const;
export type OrgPermission = (typeof ORG_PERMISSIONS)[number];

export const PLATFORM_PERMISSIONS = [
  "platform.view_all",
  "platform.campaign_ops",
  "platform.finance",
  "platform.admin",
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

const ALL_ORG = [...ORG_PERMISSIONS];

export const ROLE_PERMISSIONS: Record<OrgRole, readonly OrgPermission[]> = {
  owner: ALL_ORG,
  admin: ALL_ORG,
  marketing_manager: [
    "dealership.view",
    "campaign.view",
    "campaign.edit",
    "campaign.submit",
    "campaign.approve",
    "campaign.publish",
    "campaign.pause",
    "lead.view",
    "lead.manage",
    "lead.assign",
    "lead.export",
    "reports.view",
    "reports.export",
    "connections.manage",
    "wallet.view",
    "inventory.manage",
    "support.use",
  ],
  branch_manager: [
    "dealership.view",
    "campaign.view",
    "campaign.edit",
    "campaign.submit",
    "lead.view",
    "lead.manage",
    "lead.assign",
    "reports.view",
    "inventory.manage",
    "support.use",
  ],
  sales_user: ["dealership.view", "lead.view", "lead.manage", "support.use"],
  finance_user: [
    "dealership.view",
    "campaign.view",
    "reports.view",
    "reports.export",
    "wallet.view",
    "wallet.deposit",
    "wallet.refund_request",
    "billing.view",
    "billing.manage",
    "support.use",
  ],
  analyst: ["dealership.view", "campaign.view", "reports.view"],
};

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, readonly PlatformPermission[]> = {
  super_admin: [...PLATFORM_PERMISSIONS],
  finance_admin: ["platform.view_all", "platform.finance"],
  campaign_ops: ["platform.view_all", "platform.campaign_ops"],
};

export const ROLE_LABELS: Record<OrgRole | PlatformRole, string> = {
  owner: "Organisation Owner",
  admin: "Organisation Admin",
  marketing_manager: "Marketing Manager",
  branch_manager: "Branch Manager",
  sales_user: "Sales User",
  finance_user: "Finance User",
  analyst: "Read-only Analyst",
  super_admin: "Platform Super Admin",
  finance_admin: "Platform Finance Admin",
  campaign_ops: "Campaign Operations Manager",
};

/** Roles whose access can be limited to specific locations. */
export const LOCATION_SCOPED_ROLES: readonly OrgRole[] = ["branch_manager", "sales_user"];

export function roleHas(role: OrgRole, permission: OrgPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function platformRoleHas(role: PlatformRole | null | undefined, permission: PlatformPermission): boolean {
  return !!role && PLATFORM_ROLE_PERMISSIONS[role].includes(permission);
}
