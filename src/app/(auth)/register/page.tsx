import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form";
import { registerAction } from "../actions";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-xl font-bold">Create your account</h1>
      <p className="mt-1 text-sm text-ink-500">You will set up your organisation and first dealership next.</p>
      <div className="mt-6">
        <ActionForm action={registerAction} showSuccess={false}>
          <TextField label="Full name" name="name" autoComplete="name" required />
          <TextField label="Work email" name="email" type="email" autoComplete="email" required />
          <TextField label="Mobile number" name="phone" type="tel" autoComplete="tel" hint="Optional. Indian mobile number." />
          <TextField label="Password" name="password" type="password" autoComplete="new-password" required hint="At least 10 characters." />
          <Checkbox
            name="acceptTerms"
            label={
              <>
                I accept the <Link href="/terms" className="text-road-600 underline" target="_blank">Terms of Service</Link> and have read the{" "}
                <Link href="/privacy" className="text-road-600 underline" target="_blank">Privacy Policy</Link>.
              </>
            }
          />
          <SubmitButton className="w-full">Create account</SubmitButton>
        </ActionForm>
      </div>
      <p className="mt-6 text-center text-sm">
        Already registered? <Link href="/login" className="text-road-600 hover:underline">Log in</Link>
      </p>
    </>
  );
}
