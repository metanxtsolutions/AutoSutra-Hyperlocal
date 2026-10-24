"use client";

import { createContext, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import type { ActionState } from "@/server/actions";
import { buttonClass } from "./button";
import { cn } from "@/lib/cn";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

const FormStateContext = createContext<ActionState>({});

/** Field errors and echoed values from the last submission of the surrounding ActionForm. */
export function useFormState(): ActionState {
  return useContext(FormStateContext);
}

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  successRedirect,
  showSuccess = true,
  stayOnSuccess = false,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  successRedirect?: string;
  showSuccess?: boolean;
  /** Keep the result on screen (no refresh), e.g. to show recovery codes once. */
  stayOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!state.ok) return;
    if (resetOnSuccess) formRef.current?.reset();
    if (stayOnSuccess) return;
    if (successRedirect) {
      router.push(successRedirect);
    } else if (showSuccess && state.message) {
      // The toast survives the refresh even when this form unmounts (e.g. a status change hides it).
      // Read the query string directly: useSearchParams would force static pages to suspend.
      const next = new URLSearchParams(window.location.search);
      next.set("notice", state.message);
      router.replace(`${pathname}?${next}`, { scroll: false });
    } else {
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <FormStateContext.Provider value={state}>
      <form ref={formRef} action={formAction} className={cn("space-y-4", className)} noValidate>
        {state.error && (
          <div role="alert" className="rounded-lg border border-bad-100 bg-bad-50 px-4 py-3 text-sm font-medium text-bad-700">
            {state.error}
          </div>
        )}
        {children}
      </form>
    </FormStateContext.Provider>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className,
  pendingLabel = "Working…",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "dark";
  size?: "sm" | "md" | "lg";
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass(variant, size, className)}>
      {pending && <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Shows the field error for `name` from the surrounding ActionForm. */
export function FieldError({ name }: { name: string }) {
  const state = useFormState();
  const msg = state.fieldErrors?.[name];
  return msg ? <p className="text-xs font-medium text-bad-700">{msg}</p> : null;
}
