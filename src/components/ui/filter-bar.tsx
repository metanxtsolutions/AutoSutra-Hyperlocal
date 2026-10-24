import Link from "next/link";
import type { ReactNode } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { buttonClass } from "./button";

const control =
  "h-9 w-full rounded-lg border border-ink-200 bg-white px-2.5 text-sm text-ink-900 shadow-[0_1px_2px_0_rgb(15_27_49/0.04)] hover:border-ink-300 focus:border-road-500 focus:outline-none focus:ring-4 focus:ring-road-100";

function FilterLabel({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-xs font-medium text-ink-500">{label}</span>
      {children}
    </label>
  );
}

/**
 * GET form for list filters. Fields wrap in a two-column grid on phones and a
 * single row on wider screens; "Clear" appears once anything is filtered.
 */
export function FilterBar({ children, resetHref, active, submitLabel = "Apply", className }: { children: ReactNode; resetHref?: string; active?: boolean; submitLabel?: string; className?: string }) {
  return (
    <form method="get" className={cn("mb-4 rounded-xl border border-ink-200/80 bg-white p-3 shadow-[var(--shadow-card)]", className)}>
      <div className="grid grid-cols-2 items-end gap-2.5 sm:flex sm:flex-wrap">
        {children}
        <div className="col-span-2 flex gap-2">
          <button type="submit" className={buttonClass("dark", "md")}><SlidersHorizontal aria-hidden />{submitLabel}</button>
          {active && resetHref && <Link href={resetHref} className={buttonClass("ghost", "md")}><X aria-hidden />Clear</Link>}
        </div>
      </div>
    </form>
  );
}

export function FilterSearch({ name = "q", label = "Search", defaultValue, placeholder }: { name?: string; label?: string; defaultValue?: string; placeholder?: string }) {
  return (
    <FilterLabel label={label} className="col-span-2 sm:w-64">
      <span className="relative block">
        <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input name={name} type="search" defaultValue={defaultValue} placeholder={placeholder} className={cn(control, "pl-8")} />
      </span>
    </FilterLabel>
  );
}

export function FilterSelect({
  name,
  label,
  defaultValue,
  options,
  allLabel = "All",
  extra,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  allLabel?: string;
  /** Options shown after "All", before the list (e.g. "Unassigned"). */
  extra?: { value: string; label: string }[];
}) {
  return (
    <FilterLabel label={label} className="sm:w-44">
      <select name={name} defaultValue={defaultValue ?? ""} className={control}>
        <option value="">{allLabel}</option>
        {extra?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FilterLabel>
  );
}

export function FilterInput({ name, label, defaultValue, type = "text", placeholder }: { name: string; label: string; defaultValue?: string; type?: "text" | "date"; placeholder?: string }) {
  return (
    <FilterLabel label={label} className={type === "date" ? "sm:w-40" : "sm:w-36"}>
      <input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} className={control} />
    </FilterLabel>
  );
}
