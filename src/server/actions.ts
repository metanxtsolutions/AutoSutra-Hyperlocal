import "server-only";
import { unstable_rethrow } from "next/navigation";
import { AppError } from "./errors";

export interface ActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Echo of submitted values so forms keep user input after a validation error. */
  values?: Record<string, string>;
}

export const initialActionState: ActionState = {};

/**
 * Run a server action body and convert expected errors into form state.
 * Unexpected errors are logged and shown generically, never with internals.
 */
export async function runAction(formData: FormData | null, fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await fn();
    return { ok: true, message: message ?? "Saved" };
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() through
    const values = formData ? formValues(formData) : undefined;
    if (e instanceof AppError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors, values };
    console.error(JSON.stringify({ level: "error", msg: "action_failed", error: e instanceof Error ? e.stack ?? e.message : String(e) }));
    return { ok: false, error: "Something went wrong. Please try again, and contact support if it continues.", values };
  }
}

export function formValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string" && !k.startsWith("$") && !/password/i.test(k)) out[k] = v;
  }
  return out;
}

/** Plain object from form data; keys listed in `arrays` collect all values. */
export function formObject(fd: FormData, arrays: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$") || typeof v !== "string") continue;
    if (arrays.includes(k)) out[k] = fd.getAll(k).filter((x): x is string => typeof x === "string" && x !== "");
    else out[k] = v;
  }
  for (const a of arrays) if (!(a in out)) out[a] = [];
  return out;
}

export function checkbox(fd: FormData, name: string): boolean {
  const v = fd.get(name);
  return v === "on" || v === "true" || v === "1";
}
