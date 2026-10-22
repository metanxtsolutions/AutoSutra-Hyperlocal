import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "info" | "ok" | "warn" | "bad" | "brand" | "demo";

const tones: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700 ring-ink-200",
  info: "bg-road-100 text-road-600 ring-road-100",
  ok: "bg-ok-100 text-ok-700 ring-ok-100",
  warn: "bg-warn-100 text-warn-700 ring-warn-100",
  bad: "bg-bad-100 text-bad-700 ring-bad-100",
  brand: "bg-brand-100 text-brand-700 ring-brand-100",
  demo: "bg-white text-ink-600 ring-ink-300 border border-dashed border-ink-400",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

export function humanize(value: string | null | undefined): string {
  if (!value) return "–";
  const s = value.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const STATUS_TONES: Record<string, Tone> = {
  draft: "neutral",
  pending_approval: "warn",
  changes_requested: "warn",
  pending_funding: "warn",
  ready_to_publish: "info",
  publishing: "info",
  queued: "info",
  active: "ok",
  partially_published: "warn",
  demo_published: "demo",
  demo: "demo",
  pending_review: "info",
  rejected: "bad",
  failed: "bad",
  paused: "neutral",
  completed: "neutral",
  cancelled: "neutral",
  archived: "neutral",
  not_published: "neutral",
  connected: "ok",
  not_connected: "neutral",
  access_pending: "warn",
  error: "bad",
  expired: "bad",
  revoked: "bad",
  verified: "ok",
  unverified: "neutral",
  pending: "warn",
  confirmed: "ok",
  captured: "ok",
  requested: "warn",
  approved: "ok",
  processing: "info",
  open: "warn",
  resolved: "ok",
  adjusted: "info",
  inactive: "neutral",
  suspended: "bad",
  trialing: "info",
  past_due: "bad",
  paid: "ok",
  issued: "warn",
  void: "neutral",
  new: "info",
  sold: "ok",
  lost: "neutral",
  invalid: "neutral",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "neutral"}>{label ?? humanize(status)}</Badge>;
}
