"use client";

import { useMemo, useState } from "react";

/**
 * Stacked column chart (one y-axis). Colours come from the validated
 * categorical palette (slot 1 blue, slot 2 orange; see docs/DESIGN_SYSTEM.md).
 * Identity is never colour-alone: a legend is shown for 2+ series and a table
 * view is always available. Hovering a column shows every series' value.
 */

export interface Series {
  key: string;
  label: string;
  color: string;
}

export interface Datum {
  label: string; // x label, e.g. 2026-10-21
  values: Record<string, number | null>;
}

export const SERIES_COLORS = { slot1: "#2a78d6", slot2: "#eb6834" } as const;

type Format = "inr" | "count";

function fmt(v: number | null | undefined, format: Format, compact = false): string {
  if (v === null || v === undefined) return "–";
  if (format === "inr") {
    const rupees = v / 100;
    if (compact) {
      if (rupees >= 1e7) return `₹${(rupees / 1e7).toFixed(1)}Cr`;
      if (rupees >= 1e5) return `₹${(rupees / 1e5).toFixed(1)}L`;
      if (rupees >= 1e3) return `₹${(rupees / 1e3).toFixed(1)}k`;
    }
    return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }
  return v.toLocaleString("en-IN");
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function shortDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }) : s;
}

export function StackedBarChart({ title, data, series, format, height = 220, emptyText = "No data for this period" }: { title: string; data: Datum[]; series: Series[]; format: Format; height?: number; emptyText?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = useMemo(() => data.map((d) => series.reduce((s, x) => s + (d.values[x.key] ?? 0), 0)), [data, series]);
  const max = niceMax(Math.max(0, ...totals));
  const hasData = totals.some((t) => t > 0);
  const W = 640;
  const H = height;
  const pad = { l: 56, r: 8, t: 8, b: 26 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.min(24, Math.max(2, band * 0.6));
  const y = (v: number) => pad.t + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = Math.ceil(data.length / 8);

  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink-900">{title}</span>
        {series.length > 1 && (
          <span className="flex flex-wrap gap-3 text-xs text-ink-600" aria-hidden>
            {series.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </span>
        )}
      </figcaption>
      {!hasData ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-ink-200 text-sm text-ink-500" style={{ height }}>{emptyText}</div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${title}. Use the table view below for exact values.`} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#ebeff6" strokeWidth={1} />
                <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="#5b6f93">{fmt(t, format, true)}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = pad.l + i * band + (band - barW) / 2;
              let acc = 0;
              const segs = series.map((s, si) => {
                const v = d.values[s.key] ?? 0;
                if (v <= 0) return null;
                const y0 = y(acc);
                acc += v;
                const y1 = y(acc);
                const isTop = series.slice(si + 1).every((n) => (d.values[n.key] ?? 0) <= 0);
                const h = Math.max(0, y0 - y1 - (si > 0 ? 2 : 0)); // 2px surface gap between segments
                const top = y1;
                const r = isTop ? Math.min(4, barW / 2, h) : 0;
                const path = r
                  ? `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`
                  : `M${x},${top + h} V${top} H${x + barW} V${top + h} Z`;
                return <path key={s.key} d={path} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.45} />;
              });
              return (
                <g key={d.label}>
                  {segs}
                  {/* Hit target spans the whole band, larger than the mark. */}
                  <rect x={pad.l + i * band} y={pad.t} width={band} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
                  {i % labelEvery === 0 && (
                    <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="#5b6f93">{shortDate(d.label)}</text>
                  )}
                </g>
              );
            })}
            <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#b5c0d4" strokeWidth={1} />
          </svg>
          {hover !== null && (
            <div
              className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-md border border-ink-200 bg-white px-3 py-2 text-xs shadow-lg"
              style={{ left: `${Math.min(80, ((pad.l + hover * band) / W) * 100)}%` }}
              role="status"
            >
              <div className="mb-1 font-semibold text-ink-900">{shortDate(data[hover].label)}</div>
              {series.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-3 text-ink-700">
                  <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />{s.label}</span>
                  <span className="tabular-nums text-ink-900">{fmt(data[hover].values[s.key], format)}</span>
                </div>
              ))}
              {series.length > 1 && <div className="mt-1 flex justify-between border-t border-ink-100 pt-1 font-medium text-ink-900"><span>Total</span><span className="tabular-nums">{fmt(totals[hover], format)}</span></div>}
            </div>
          )}
        </div>
      )}
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-ink-500">Table view</summary>
        <div className="mt-1 max-h-56 overflow-auto">
          <table className="min-w-full">
            <thead><tr className="text-left text-ink-500"><th className="py-1 pr-3">Date</th>{series.map((s) => <th key={s.key} className="py-1 pr-3 text-right">{s.label}</th>)}</tr></thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label} className="border-t border-ink-100"><td className="py-1 pr-3">{d.label}</td>{series.map((s) => <td key={s.key} className="py-1 pr-3 text-right tabular-nums">{fmt(d.values[s.key], format)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
