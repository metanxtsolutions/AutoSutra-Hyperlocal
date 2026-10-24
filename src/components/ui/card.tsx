import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, OctagonAlert, Car } from "lucide-react";
import { cn } from "@/lib/cn";

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cn("rounded-[var(--radius-card)] border border-ink-200/80 bg-white shadow-[var(--shadow-card)]", padded && "p-5", className)}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description, actions, icon }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-ink-50 text-ink-600 ring-1 ring-ink-200/70 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-6 tracking-tight">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  breadcrumbs,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  breadcrumbs?: Crumb[];
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1.5 flex flex-wrap items-center gap-1 text-[13px] text-ink-500">
            {breadcrumbs.map((c, i) => (
              <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1">
                {i > 0 && <ChevronRight aria-hidden className="h-3.5 w-3.5 text-ink-300" />}
                {c.href ? <Link href={c.href} className="hover:text-ink-800">{c.label}</Link> : <span>{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        {eyebrow && <div className="mb-1 text-[13px] font-medium text-ink-500">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const STAT_TONES = {
  default: "bg-road-50 text-road-600 ring-road-100",
  ok: "bg-ok-50 text-ok-700 ring-ok-100",
  warn: "bg-warn-50 text-warn-700 ring-warn-100",
  bad: "bg-bad-50 text-bad-700 ring-bad-100",
} as const;

/** A headline figure: label, value and a short note. */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  icon,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "warn" | "bad" | "ok";
  icon?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[13px] font-medium text-ink-500">{label}</div>
        {icon && <span aria-hidden className={cn("hidden h-8 w-8 flex-none items-center justify-center rounded-lg ring-1 sm:flex [&_svg]:h-4 [&_svg]:w-4", STAT_TONES[tone])}>{icon}</span>}
      </div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tracking-tight tabular-nums text-ink-950",
          tone === "warn" && "text-warn-700",
          tone === "bad" && "text-bad-700",
          tone === "ok" && "text-ok-700",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
    </>
  );
  const cls = "block rounded-[var(--radius-card)] border border-ink-200/80 bg-white p-4 shadow-[var(--shadow-card)]";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-ink-300")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-ink-200/80 bg-white px-6 py-12 text-center shadow-[var(--shadow-card)]">
      <div aria-hidden className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-road-50 text-road-600 ring-8 ring-road-50/50 [&_svg]:h-6 [&_svg]:w-6">
        {icon ?? <Car />}
      </div>
      <h3 className="mt-4 text-[15px] font-semibold">{title}</h3>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

const ALERT_STYLES = {
  info: { box: "border-road-100 bg-road-50 text-ink-800", icon: <Info className="text-road-600" /> },
  warn: { box: "border-warn-100 bg-warn-50 text-ink-900", icon: <AlertTriangle className="text-warn-700" /> },
  bad: { box: "border-bad-100 bg-bad-50 text-bad-700", icon: <OctagonAlert className="text-bad-700" /> },
  ok: { box: "border-ok-100 bg-ok-50 text-ok-700", icon: <CheckCircle2 className="text-ok-700" /> },
} as const;

export function Alert({ tone = "info", title, children }: { tone?: "info" | "warn" | "bad" | "ok"; title?: ReactNode; children?: ReactNode }) {
  const s = ALERT_STYLES[tone];
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", s.box)}>
      <span aria-hidden className="mt-0.5 flex-none [&_svg]:h-4 [&_svg]:w-4">{s.icon}</span>
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cn(!!title && "mt-0.5")}>{children}</div>}
      </div>
    </div>
  );
}

export function DescriptionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-[13px] font-medium text-ink-500">{i.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink-900">{i.value ?? "–"}</dd>
        </div>
      ))}
    </dl>
  );
}
