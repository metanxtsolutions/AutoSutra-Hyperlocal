"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NAV_ICONS, type NavIconName } from "./nav-icons";

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
  section?: string;
  icon?: NavIconName;
  /** Shown in the phone tab bar (up to four). */
  mobile?: boolean;
}

/** The item whose link best matches the current path (longest prefix wins). */
export function activeItem(items: NavItem[], pathname: string): NavItem | undefined {
  return items
    .filter((i) => pathname === i.href || (pathname.startsWith(i.href + "/") && i.href !== "/app" && i.href !== "/admin"))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = activeItem(items, pathname);
  let lastSection: string | undefined;
  return (
    <nav aria-label="App" className="flex-1 px-3 py-2 text-sm">
      {items.map((item) => {
        const active = current?.href === item.href;
        const header = item.section && item.section !== lastSection ? item.section : null;
        lastSection = item.section;
        const Icon = item.icon ? NAV_ICONS[item.icon] : null;
        return (
          <div key={item.href}>
            {header && <div className="mt-5 px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{header}</div>}
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex h-9 items-center gap-2.5 rounded-lg px-2.5 font-medium transition-colors",
                active ? "bg-road-50 text-road-700" : "text-ink-600 hover:bg-ink-100/70 hover:text-ink-950",
              )}
            >
              {Icon && <Icon aria-hidden className={cn("h-[18px] w-[18px] flex-none", active ? "text-road-600" : "text-ink-400 group-hover:text-ink-600")} />}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {!!item.badge && (
                <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none", active ? "bg-road-600 text-white" : "bg-ink-100 text-ink-700")}>
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
