import { switchOrgAction } from "@/app/app/actions";

export function OrgSwitcher({ current, orgs }: { current: string; orgs: { id: string; name: string }[] }) {
  if (orgs.length <= 1) {
    return <div className="mx-4 mb-2 truncate rounded-md bg-ink-800 px-3 py-2 text-sm font-medium text-white">{orgs[0]?.name}</div>;
  }
  return (
    <form action={switchOrgAction} className="mx-4 mb-2 flex gap-1">
      <label htmlFor="org-switch" className="sr-only">Organisation</label>
      <select id="org-switch" name="organisationId" defaultValue={current} className="min-w-0 flex-1 rounded-md border-0 bg-ink-800 px-2 py-2 text-sm text-white">
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
      <button type="submit" className="rounded-md bg-ink-700 px-2 text-xs text-white">Switch</button>
    </form>
  );
}
