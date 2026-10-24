import Link from "next/link";
import type { ReactNode } from "react";
import { Bell, ChevronsUpDown, LayoutDashboard, LifeBuoy, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { LogoMark } from "@/components/brand";
import { logoutAction } from "@/app/(auth)/actions";
import { ROLE_LABELS } from "@/server/auth/permissions";
import type { Actor } from "@/server/auth/context";
import { NavLinks, type NavItem } from "./nav-links";
import { MobileNav } from "./mobile-nav";
import { OrgSwitcher } from "./org-switcher";
import { CurrentSection } from "./current-section";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span aria-hidden className={`flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gradient-to-br from-road-500 to-road-700 text-xs font-semibold text-white ${className ?? ""}`}>
      {initials(name) || "?"}
    </span>
  );
}

/** Account links shared by the sidebar menu and the phone "More" sheet. */
function AccountLinks({ actor, area }: { actor: Actor; area: "app" | "admin" }) {
  const item = "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-ink-700 hover:bg-ink-100/70 hover:text-ink-950 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-ink-400";
  return (
    <div className="space-y-0.5">
      <Link href="/app/account" className={item}><UserRound />Your account</Link>
      <Link href="/app/account/security" className={item}><ShieldCheck />Two-step verification</Link>
      {actor.user.platformRole && area === "app" && <Link href="/admin" className={item}><LayoutDashboard />Admin console</Link>}
      {area === "admin" && actor.membership && <Link href="/app" className={item}><LayoutDashboard />Customer app</Link>}
      {area === "app" && <Link href="/app/support" className={item}><LifeBuoy />Help and support</Link>}
      <form action={logoutAction}>
        <button type="submit" className={item}><LogOut />Log out</button>
      </form>
    </div>
  );
}

export function AppShell({
  actor,
  nav,
  orgs,
  children,
  area = "app",
  banner,
  notifications,
}: {
  actor: Actor;
  nav: NavItem[];
  orgs?: { id: string; name: string }[];
  children: ReactNode;
  area?: "app" | "admin";
  banner?: ReactNode;
  /** Unread notifications, shown on the bell. */
  notifications?: { href: string; count: number };
}) {
  const roleLabel = area === "admin" && actor.user.platformRole ? ROLE_LABELS[actor.user.platformRole] : actor.membership ? ROLE_LABELS[actor.membership.role] : "";
  const homeHref = area === "admin" ? "/admin" : "/app";

  return (
    <div className="min-h-screen bg-ink-50 lg:pl-[248px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-ink-200/80 bg-white lg:flex">
        <div className="flex h-14 flex-none items-center gap-2 px-5">
          <Link href={homeHref} className="flex items-center gap-2 font-semibold tracking-tight text-ink-950" aria-label="AutoSutra home">
            <LogoMark />
            <span className="text-[15px]">AutoSutra</span>
          </Link>
          {area === "admin" && <span className="ml-auto rounded-md bg-ink-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">Admin</span>}
        </div>
        {area === "app" && orgs && actor.membership && (
          <div className="flex-none px-3 pb-1">
            <OrgSwitcher current={actor.membership.organisationId} orgs={orgs} role={roleLabel} />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavLinks items={nav} />
        </div>
        <details className="group relative flex-none border-t border-ink-100 p-3">
          <summary className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-ink-100/70">
            <Avatar name={actor.user.name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink-950">{actor.user.name}</span>
              <span className="block truncate text-xs text-ink-500">{roleLabel || actor.user.email}</span>
            </span>
            <ChevronsUpDown aria-hidden className="h-4 w-4 text-ink-400" />
          </summary>
          <div className="absolute inset-x-3 bottom-full mb-2 rounded-xl border border-ink-200/80 bg-white p-1.5 shadow-[var(--shadow-pop)]">
            <div className="px-2.5 pb-2 pt-1.5 text-xs text-ink-500">{actor.user.email}</div>
            <AccountLinks actor={actor} area={area} />
          </div>
        </details>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-ink-200/80 bg-white/90 px-4 backdrop-blur sm:px-6">
        <Link href={homeHref} className="flex min-w-0 items-center gap-2 lg:hidden" aria-label="AutoSutra home">
          <LogoMark className="h-7 w-7 flex-none" />
          <span className="truncate text-[15px] font-semibold tracking-tight">{area === "admin" ? "AutoSutra Admin" : (actor.membership?.organisationName ?? "AutoSutra")}</span>
        </Link>
        <div className="hidden min-w-0 lg:block">
          <CurrentSection items={nav} />
        </div>
        <div className="ml-auto flex items-center gap-1">
          {notifications && (
            <Link href={notifications.href} className="relative rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label={notifications.count ? `Notifications, ${notifications.count} unread` : "Notifications"}>
              <Bell className="h-5 w-5" />
              {notifications.count > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad-700 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white">
                  {notifications.count > 9 ? "9+" : notifications.count}
                </span>
              )}
            </Link>
          )}
          <Link href="/app/account" className="rounded-full p-1 lg:hidden" aria-label="Your account">
            <Avatar name={actor.user.name} className="h-7 w-7 text-[11px]" />
          </Link>
        </div>
      </header>

      {banner}
      <main id="main" className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
        {children}
      </main>
      <MobileNav items={nav} footer={<AccountLinks actor={actor} area={area} />} />
    </div>
  );
}
