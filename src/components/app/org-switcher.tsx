import { Check, ChevronsUpDown } from "lucide-react";
import { switchOrgAction } from "@/app/app/actions";

function OrgBadge({ name }: { name: string }) {
  return (
    <span aria-hidden className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-ink-900 text-xs font-semibold text-white">
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function OrgSwitcher({ current, orgs, role }: { current: string; orgs: { id: string; name: string }[]; role?: string }) {
  const active = orgs.find((o) => o.id === current) ?? orgs[0];
  const body = (
    <>
      <OrgBadge name={active?.name ?? ""} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold text-ink-950">{active?.name}</span>
        {role && <span className="block truncate text-xs text-ink-500">{role}</span>}
      </span>
    </>
  );
  if (orgs.length <= 1) {
    return <div className="flex items-center gap-2.5 rounded-xl border border-ink-200/80 bg-ink-50/60 p-2">{body}</div>;
  }
  return (
    <details className="relative">
      <summary className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-ink-200/80 bg-ink-50/60 p-2 hover:border-ink-300">
        {body}
        <ChevronsUpDown aria-hidden className="h-4 w-4 text-ink-400" />
        <span className="sr-only">Switch organisation</span>
      </summary>
      <div className="absolute inset-x-0 top-full z-40 mt-1 rounded-xl border border-ink-200/80 bg-white p-1.5 shadow-[var(--shadow-pop)]">
        <div className="px-2 pb-1 pt-1 text-xs font-medium text-ink-500">Switch organisation</div>
        {orgs.map((o) => (
          <form key={o.id} action={switchOrgAction}>
            <input type="hidden" name="organisationId" value={o.id} />
            <button type="submit" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-ink-100/70">
              <OrgBadge name={o.name} />
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              {o.id === current && <Check aria-hidden className="h-4 w-4 text-road-600" />}
            </button>
          </form>
        ))}
      </div>
    </details>
  );
}
