import type { ReactNode } from "react";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-ink-500">Last updated {updated}</p>
      <div className="mt-4 rounded-lg border border-warn-100 bg-warn-100/60 p-4 text-sm">
        Draft for legal review. This document has not yet been reviewed by qualified Indian legal counsel and must be reviewed before production launch.
      </div>
      <div className="mt-8 space-y-6 text-[15px] leading-7 text-ink-800 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </div>
  );
}
