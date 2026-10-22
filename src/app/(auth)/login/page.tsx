import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { TextField } from "@/components/ui/fields";
import { loginAction } from "../actions";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-bold">Log in</h1>
      <p className="mt-1 text-sm text-ink-500">Welcome back to AutoSutra.</p>
      <div className="mt-6">
        <ActionForm action={loginAction} showSuccess={false}>
          <input type="hidden" name="next" value={next ?? ""} />
          <TextField label="Email" name="email" type="email" autoComplete="email" required />
          <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
          <SubmitButton className="w-full">Log in</SubmitButton>
        </ActionForm>
      </div>
      <div className="mt-6 flex justify-between text-sm">
        <Link href="/forgot-password" className="text-road-600 hover:underline">Forgot password?</Link>
        <Link href="/register" className="text-road-600 hover:underline">Create an account</Link>
      </div>
    </>
  );
}
