import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/fields";
import { forgotPasswordAction } from "../actions";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1 text-sm text-ink-500">Enter your account email and we will send a reset link.</p>
      <div className="mt-6">
        <ActionForm action={forgotPasswordAction} resetOnSuccess>
          <TextField label="Email" name="email" type="email" autoComplete="email" required />
          <SubmitButton className="w-full">Send reset link</SubmitButton>
        </ActionForm>
      </div>
      <p className="mt-6 text-center text-sm"><Link href="/login" className="text-road-600 hover:underline">Back to log in</Link></p>
    </>
  );
}
