"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
  section?: string;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  let lastSection: string | undefined;
  return (
    <nav aria-label="App" className="flex-1 px-2 py-2 text-sm">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== "/app" && item.href !== "/admin" && pathname.startsWith(item.href + "/")) || pathname === item.href;
        const header = item.section && item.section !== lastSection ? item.section : null;
        lastSection = item.section;
        return (
          <div key={item.href}>
            {header && <div className="mt-4 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-500">{header}</div>}
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-2 font-medium",
                active ? "bg-ink-800 text-white" : "text-ink-300 hover:bg-ink-800/60 hover:text-white",
              )}
            >
              {item.label}
              {!!item.badge && <span className="rounded-full bg-brand-500 px-1.5 text-xs font-bold text-ink-950">{item.badge}</span>}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
