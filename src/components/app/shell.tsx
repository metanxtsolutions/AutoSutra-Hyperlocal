import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand";
import { logoutAction } from "@/app/(auth)/actions";
import { ROLE_LABELS } from "@/server/auth/permissions";
import type { Actor } from "@/server/auth/context";
import { NavLinks, type NavItem } from "./nav-links";
import { OrgSwitcher } from "./org-switcher";

export function AppShell({
  actor,
  nav,
  orgs,
  children,
  area = "app",
  banner,
}: {
  actor: Actor;
  nav: NavItem[];
  orgs?: { id: string; name: string }[];
  children: ReactNode;
  area?: "app" | "admin";
  banner?: ReactNode;
}) {
  const roleLabel = area === "admin" && actor.user.platformRole ? ROLE_LABELS[actor.user.platformRole] : actor.membership ? ROLE_LABELS[actor.membership.role] : "";
  const sidebar = (
    <>
      <div className="px-4 py-4">
        <Logo inverted className="[&_span>span]:hidden" />
        {area === "admin" && <div className="mt-2 rounded bg-brand-500 px-2 py-0.5 text-center text-xs font-bold uppercase tracking-wide text-ink-950">Admin console</div>}
      </div>
      {area === "app" && orgs && actor.membership && <OrgSwitcher current={actor.membership.organisationId} orgs={orgs} />}
      <NavLinks items={nav} />
      <div className="mt-auto border-t border-ink-800 p-4 text-sm">
        <div className="truncate font-medium text-white">{actor.user.name}</div>
        <div className="truncate text-xs text-ink-400">{roleLabel}</div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          <Link href="/app/account" className="text-ink-300 hover:text-white">Account</Link>
          {actor.user.platformRole && area === "app" && <Link href="/admin" className="text-ink-300 hover:text-white">Admin console</Link>}
          {area === "admin" && actor.membership && <Link href="/app" className="text-ink-300 hover:text-white">Customer app</Link>}
          <form action={logoutAction}>
            <button type="submit" className="text-ink-300 hover:text-white">Log out</button>
          </form>
        </div>
      </div>
    </>
  );
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 flex-none flex-col bg-ink-900 lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-y-auto [&>*]:shrink-0">{sidebar}</aside>
      <details className="group bg-ink-900 lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-white marker:hidden">
          <span className="font-semibold">AutoSutra</span>
          <span aria-hidden className="text-xl">☰</span>
          <span className="sr-only">Open navigation</span>
        </summary>
        <div className="flex flex-col pb-2">{sidebar}</div>
      </details>
      <div className="min-w-0 flex-1">
        {banner}
        <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
