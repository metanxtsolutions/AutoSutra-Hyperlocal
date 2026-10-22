import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/fields";
import { resetPasswordAction } from "../actions";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-bold">Choose a new password</h1>
      <p className="mt-1 text-sm text-ink-500">Signing in with a new password signs you out on all other devices.</p>
      <div className="mt-6">
        <ActionForm action={resetPasswordAction} showSuccess={false}>
          <input type="hidden" name="token" value={token ?? ""} />
          <TextField label="New password" name="password" type="password" autoComplete="new-password" required hint="At least 10 characters." />
          <TextField label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
          <SubmitButton className="w-full">Change password</SubmitButton>
        </ActionForm>
      </div>
    </>
  );
}
