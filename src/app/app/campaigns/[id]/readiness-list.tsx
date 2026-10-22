import type { Readiness } from "@/server/services/campaigns";

const ICON = { blocker: "✕", warning: "!", info: "i" };
const TONE = { blocker: "text-bad-700 bg-bad-100", warning: "text-warn-700 bg-warn-100", info: "text-road-600 bg-road-100" };

export function ReadinessList({ readiness }: { readiness: Readiness }) {
  if (!readiness.findings.length) return <p className="text-sm font-medium text-ok-700">✓ All checks passed.</p>;
  const order = { blocker: 0, warning: 1, info: 2 };
  return (
    <ul className="space-y-2 text-sm">
      {[...readiness.findings].sort((a, b) => order[a.severity] - order[b.severity]).map((f) => (
        <li key={f.key} className="flex gap-2">
          <span aria-hidden className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-bold ${TONE[f.severity]}`}>{ICON[f.severity]}</span>
          <span><span className="sr-only">{f.severity}: </span>{f.message}</span>
        </li>
      ))}
    </ul>
  );
}
