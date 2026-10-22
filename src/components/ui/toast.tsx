"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Shows ?notice= / ?error= messages set by redirects after server actions,
 * then removes them from the URL so a refresh does not repeat them.
 */
export function Toaster() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [toast, setToast] = useState<{ kind: "notice" | "error"; text: string } | null>(null);

  useEffect(() => {
    const notice = params.get("notice");
    const error = params.get("error");
    if (!notice && !error) return;
    setToast(error ? { kind: "error", text: error } : { kind: "notice", text: notice! });
    const next = new URLSearchParams(params);
    next.delete("notice");
    next.delete("error");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [params, pathname, router]);

  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" aria-live="polite">
      <div
        role={toast.kind === "error" ? "alert" : "status"}
        className={`pointer-events-auto flex max-w-lg items-start gap-3 rounded-lg px-4 py-3 text-sm shadow-lg ${
          toast.kind === "error" ? "bg-bad-700 text-white" : "bg-ink-900 text-white"
        }`}
      >
        <span className="flex-1">{toast.text}</span>
        <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} className="opacity-80 hover:opacity-100">
          ✕
        </button>
      </div>
    </div>
  );
}
