"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Ellipsis, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { NAV_ICONS } from "./nav-icons";
import { activeItem, NavLinks, type NavItem } from "./nav-links";

/** Phone navigation: a bottom tab bar for the main areas and a "More" sheet with everything else. */
export function MobileNav({ items, footer }: { items: NavItem[]; footer?: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const tabs = items.filter((i) => i.mobile).slice(0, 4);
  const current = activeItem(items, pathname);
  const moreActive = !!current && !tabs.some((t) => t.href === current.href);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="grid grid-cols-5">
          {tabs.map((t) => {
            const Icon = t.icon ? NAV_ICONS[t.icon] : null;
            const active = current?.href === t.href;
            return (
              <li key={t.href}>
                <Link href={t.href} aria-current={active ? "page" : undefined} className={cn("relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-road-600" : "text-ink-500")}>
                  {Icon && <Icon aria-hidden className="h-5 w-5" />}
                  <span className="max-w-full truncate px-1">{t.label}</span>
                  {!!t.badge && <span className="absolute right-[22%] top-2 h-2 w-2 rounded-full bg-bad-500 ring-2 ring-white" aria-label={`${t.badge} new`} />}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setOpen(true)} aria-expanded={open} className={cn("flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium", moreActive ? "text-road-600" : "text-ink-500")}>
              <Ellipsis aria-hidden className="h-5 w-5" />
              More
            </button>
          </li>
        </ul>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="All sections">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-ink-950/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-[var(--shadow-pop)]">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
              <span className="text-[15px] font-semibold">All sections</span>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-ink-500 hover:bg-ink-100" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
              <NavLinks items={items} onNavigate={() => setOpen(false)} />
              {footer && <div className="border-t border-ink-100 px-3 py-3">{footer}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
