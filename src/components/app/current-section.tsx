"use client";

import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { activeItem, type NavItem } from "./nav-links";

/** "Section › Page" for the app bar, from the navigation entry matching the current path. */
export function CurrentSection({ items }: { items: NavItem[] }) {
  const item = activeItem(items, usePathname());
  if (!item) return null;
  return (
    <div className="flex items-center gap-1.5 text-sm text-ink-500">
      {item.section && (
        <>
          <span>{item.section}</span>
          <ChevronRight aria-hidden className="h-3.5 w-3.5 text-ink-300" />
        </>
      )}
      <span className="font-medium text-ink-900">{item.label}</span>
    </div>
  );
}
