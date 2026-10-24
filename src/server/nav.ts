import "server-only";
import type { NavItem } from "@/components/app/nav-links";
import { can, hasPlatform, type Actor } from "./auth/context";

export function customerNav(actor: Actor, opts: { walletEnabled: boolean; onboardingDone: boolean; counts?: { approvals?: number; notifications?: number; leads?: number } }): NavItem[] {
  const m = actor.membership;
  if (!m) return [{ href: "/app/onboarding", label: "Get started", icon: "checklist" }];
  const org = m.organisationId;
  const items: NavItem[] = [{ href: "/app", label: "Dashboard", icon: "dashboard", mobile: true }];
  if (!opts.onboardingDone) items.push({ href: "/app/onboarding", label: "Setup checklist", icon: "checklist" });
  if (can(actor, org, "campaign.view")) {
    items.push({ href: "/app/campaigns", label: "Campaigns", section: "Advertising", icon: "campaigns", mobile: true, badge: opts.counts?.approvals });
    items.push({ href: "/app/templates", label: "Templates", section: "Advertising", icon: "templates" });
  }
  if (can(actor, org, "lead.view")) items.push({ href: "/app/leads", label: "Lead centre", section: "Advertising", icon: "leads", mobile: true, badge: opts.counts?.leads });
  if (can(actor, org, "reports.view")) items.push({ href: "/app/reports", label: "Reports", section: "Advertising", icon: "reports", mobile: true });
  items.push({ href: "/app/dealerships", label: "Dealerships", section: "Business", icon: "dealerships" });
  items.push({ href: "/app/locations", label: "Locations map", section: "Business", icon: "locations" });
  if (can(actor, org, "inventory.manage")) items.push({ href: "/app/inventory", label: "Inventory", section: "Business", icon: "inventory" });
  if (opts.walletEnabled && can(actor, org, "wallet.view")) items.push({ href: "/app/wallet", label: "Ad budget wallet", section: "Money", icon: "wallet" });
  if (can(actor, org, "billing.view")) items.push({ href: "/app/billing", label: "Subscription & billing", section: "Money", icon: "billing" });
  if (can(actor, org, "team.manage") || can(actor, org, "dealership.view")) items.push({ href: "/app/team", label: "Team", section: "Settings", icon: "team" });
  if (can(actor, org, "connections.manage")) items.push({ href: "/app/settings/connections", label: "Ad accounts", section: "Settings", icon: "connections" });
  if (can(actor, org, "org.manage")) {
    items.push({ href: "/app/settings/organisation", label: "Organisation", section: "Settings", icon: "settings" });
    items.push({ href: "/app/audit", label: "Audit log", section: "Settings", icon: "audit" });
  }
  if (can(actor, org, "support.use")) items.push({ href: "/app/support", label: "Support", section: "Settings", icon: "support" });
  return items;
}

export function adminNav(actor: Actor, counts: { approvals?: number; diffs?: number; refunds?: number; tickets?: number } = {}): NavItem[] {
  const items: NavItem[] = [{ href: "/admin", label: "Overview", icon: "dashboard", mobile: true }];
  items.push({ href: "/admin/organisations", label: "Organisations", section: "Customers", icon: "dealerships", mobile: true });
  items.push({ href: "/admin/users", label: "Users", section: "Customers", icon: "team" });
  items.push({ href: "/admin/support", label: "Support tickets", section: "Customers", icon: "support", badge: counts.tickets });
  items.push({ href: "/admin/contact-requests", label: "Contact requests", section: "Customers", icon: "messages" });
  items.push({ href: "/admin/emails", label: "Emails", section: "Customers", icon: "emails" });
  items.push({ href: "/admin/campaigns", label: "Campaign operations", section: "Campaigns", icon: "campaigns", mobile: true, badge: counts.approvals });
  items.push({ href: "/admin/connections", label: "Provider connections", section: "Campaigns", icon: "connections" });
  items.push({ href: "/admin/jobs", label: "Jobs & API health", section: "Campaigns", icon: "jobs", mobile: true });
  if (hasPlatform(actor, "platform.finance") || hasPlatform(actor, "platform.admin")) {
    items.push({ href: "/admin/finance/ledger", label: "Ledger", section: "Finance", icon: "ledger" });
    items.push({ href: "/admin/finance/payments", label: "Payments", section: "Finance", icon: "billing" });
    items.push({ href: "/admin/finance/refunds", label: "Refunds", section: "Finance", icon: "refunds", badge: counts.refunds });
    items.push({ href: "/admin/finance/reconciliation", label: "Reconciliation", section: "Finance", icon: "reconciliation", badge: counts.diffs });
  }
  if (hasPlatform(actor, "platform.admin")) {
    items.push({ href: "/admin/plans", label: "Subscription plans", section: "Platform", icon: "plans" });
    items.push({ href: "/admin/flags", label: "Feature flags & funding", section: "Platform", icon: "flags" });
  }
  items.push({ href: "/admin/audit", label: "Audit logs", section: "Platform", icon: "audit" });
  return items;
}
