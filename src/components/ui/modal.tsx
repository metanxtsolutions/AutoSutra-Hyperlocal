"use client";

import { useRef, type ReactNode } from "react";
import { buttonClass } from "./button";

/** Accessible modal built on the native <dialog> element (focus trapping and Esc handled by the browser). */
export function Modal({
  trigger,
  title,
  children,
  triggerVariant = "secondary",
  triggerSize = "sm",
}: {
  trigger: ReactNode;
  title: string;
  children: ReactNode;
  triggerVariant?: "primary" | "secondary" | "ghost" | "danger" | "dark";
  triggerSize?: "sm" | "md";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={buttonClass(triggerVariant, triggerSize)} onClick={() => ref.current?.showModal()}>
        {trigger}
      </button>
      <dialog
        ref={ref}
        aria-label={title}
        className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-xl border border-ink-200 p-0 shadow-xl backdrop:bg-ink-950/40"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" aria-label="Close" className={buttonClass("ghost", "sm")} onClick={() => ref.current?.close()}>
            ✕
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
      </dialog>
    </>
  );
}
