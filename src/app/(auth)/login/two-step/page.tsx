import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/fields";
import { twoStepToken } from "@/server/auth/session";
import { twoStepLoginAction } from "../../actions";

export const metadata: Metadata = { title: "Two-step verification" };

export default async function TwoStepPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!(await twoStepToken())) redirect("/login");
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Enter your code</h1>
      <p className="mt-1 text-sm text-ink-500">Open your authenticator app and enter the 6-digit code for AutoSutra.</p>
      <div className="mt-6">
        <ActionForm action={twoStepLoginAction} showSuccess={false}>
          <input type="hidden" name="next" value={next ?? ""} />
          <TextField
            label="Code"
            name="code"
            required
            autoFocus
            autoComplete="one-time-code"
            inputMode="text"
            hint="Lost your phone? Enter one of your recovery codes instead."
          />
          <SubmitButton className="w-full">Verify and sign in</SubmitButton>
        </ActionForm>
      </div>
      <p className="mt-6 text-sm">
        <Link href="/login" className="text-road-600 hover:underline">Start again</Link>
        <span className="text-ink-500"> · No codes left? Contact AutoSutra support to reset two-step verification.</span>
      </p>
    </>
  );
}
