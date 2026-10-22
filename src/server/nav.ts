import "server-only";
import type { NavItem } from "@/components/app/nav-links";
import { can, hasPlatform, type Actor } from "./auth/context";

export function customerNav(actor: Actor, opts: { walletEnabled: boolean; onboardingDone: boolean; counts?: { approvals?: number; notifications?: number; leads?: number } }): NavItem[] {
  const m = actor.membership;
  if (!m) return [{ href: "/app/onboarding", label: "Get started" }];
  const org = m.organisationId;
  const items: NavItem[] = [{ href: "/app", label: "Dashboard" }];
  if (!opts.onboardingDone) items.push({ href: "/app/onboarding", label: "Setup checklist" });
  items.push({ href: "/app/notifications", label: "Notifications", badge: opts.counts?.notifications });
  if (can(actor, org, "campaign.view")) {
    items.push({ href: "/app/campaigns", label: "Campaigns", section: "Advertising", badge: opts.counts?.approvals });
    items.push({ href: "/app/templates", label: "Templates", section: "Advertising" });
  }
  if (can(actor, org, "lead.view")) items.push({ href: "/app/leads", label: "Lead centre", section: "Advertising", badge: opts.counts?.leads });
  if (can(actor, org, "reports.view")) items.push({ href: "/app/reports", label: "Reports", section: "Advertising" });
  items.push({ href: "/app/dealerships", label: "Dealerships", section: "Business" });
  items.push({ href: "/app/locations", label: "Locations map", section: "Business" });
  if (can(actor, org, "inventory.manage")) items.push({ href: "/app/inventory", label: "Inventory", section: "Business" });
  if (opts.walletEnabled && can(actor, org, "wallet.view")) items.push({ href: "/app/wallet", label: "Ad budget wallet", section: "Money" });
  if (can(actor, org, "billing.view")) items.push({ href: "/app/billing", label: "Subscription & billing", section: "Money" });
  if (can(actor, org, "team.manage") || can(actor, org, "dealership.view")) items.push({ href: "/app/team", label: "Team", section: "Settings" });
  if (can(actor, org, "connections.manage")) items.push({ href: "/app/settings/connections", label: "Ad accounts", section: "Settings" });
  if (can(actor, org, "org.manage")) {
    items.push({ href: "/app/settings/organisation", label: "Organisation", section: "Settings" });
    items.push({ href: "/app/audit", label: "Audit log", section: "Settings" });
  }
  if (can(actor, org, "support.use")) items.push({ href: "/app/support", label: "Support", section: "Settings" });
  return items;
}

export function adminNav(actor: Actor, counts: { approvals?: number; diffs?: number; refunds?: number; tickets?: number } = {}): NavItem[] {
  const items: NavItem[] = [{ href: "/admin", label: "Overview" }];
  items.push({ href: "/admin/organisations", label: "Organisations", section: "Customers" });
  items.push({ href: "/admin/users", label: "Users", section: "Customers" });
  items.push({ href: "/admin/support", label: "Support tickets", section: "Customers", badge: counts.tickets });
  items.push({ href: "/admin/contact-requests", label: "Contact requests", section: "Customers" });
  items.push({ href: "/admin/emails", label: "Emails", section: "Customers" });
  items.push({ href: "/admin/campaigns", label: "Campaign operations", section: "Campaigns", badge: counts.approvals });
  items.push({ href: "/admin/connections", label: "Provider connections", section: "Campaigns" });
  items.push({ href: "/admin/jobs", label: "Jobs & API health", section: "Campaigns" });
  if (hasPlatform(actor, "platform.finance") || hasPlatform(actor, "platform.admin")) {
    items.push({ href: "/admin/finance/ledger", label: "Ledger", section: "Finance" });
    items.push({ href: "/admin/finance/payments", label: "Payments", section: "Finance" });
    items.push({ href: "/admin/finance/refunds", label: "Refunds", section: "Finance", badge: counts.refunds });
    items.push({ href: "/admin/finance/reconciliation", label: "Reconciliation", section: "Finance", badge: counts.diffs });
  }
  if (hasPlatform(actor, "platform.admin")) {
    items.push({ href: "/admin/plans", label: "Subscription plans", section: "Platform" });
    items.push({ href: "/admin/flags", label: "Feature flags & funding", section: "Platform" });
  }
  items.push({ href: "/admin/audit", label: "Audit logs", section: "Platform" });
  return items;
}
