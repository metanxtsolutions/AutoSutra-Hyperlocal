import Link from "next/link";
import { cn } from "@/lib/cn";

/** Link-based tabs: each tab is a real URL, so they work without JavaScript and are shareable. */
export function Tabs({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <nav aria-label="Sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-ink-200">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
            t.key === active ? "border-brand-500 text-ink-950" : "border-transparent text-ink-500 hover:text-ink-800",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-ink-100 px-1.5 text-xs text-ink-600">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
