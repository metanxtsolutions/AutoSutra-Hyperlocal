"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useFormState } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";

/** Hides its children once the surrounding form succeeded (the result is shown instead). */
export function HideOnSuccess({ children }: { children: ReactNode }) {
  return useFormState().ok ? null : <>{children}</>;
}

/** Shows recovery codes returned by the surrounding form, once. They are not stored in readable form. */
export function RecoveryCodes() {
  const state = useFormState();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const codes = (state.ok && (state.data?.codes as string[] | undefined)) || null;
  if (!codes) return null;
  const text = `AutoSutra recovery codes\nEach code works once. Keep them somewhere safe.\n\n${codes.join("\n")}\n`;
  return (
    <div role="status" data-codes className="space-y-4 rounded-lg border border-ok-100 bg-ok-100/40 p-4">
      <div>
        <p className="font-semibold text-ink-950">{state.message}</p>
        <p className="mt-1 text-sm text-ink-700">
          Save these recovery codes now. Each one lets you sign in once if you lose your phone. They will not be shown again.
        </p>
      </div>
      <ol className="grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((c) => (
          <li key={c} className="rounded-md bg-white px-3 py-2 text-center ring-1 ring-ink-200">
            {c}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy codes"}
        </Button>
        <a
          className="inline-flex h-10 items-center rounded-lg border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-900 shadow-sm hover:bg-ink-50"
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
          download="autosutra-recovery-codes.txt"
        >
          Download
        </a>
        <Button type="button" onClick={() => router.refresh()}>
          I have saved them
        </Button>
      </div>
    </div>
  );
}
