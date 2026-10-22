import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClass } from "@/components/ui/button";
import { getDb } from "@/server/db/client";
import { getActor } from "@/server/auth/session";
import { verifyEmail } from "@/server/services/auth";
import { resendVerificationAction } from "../actions";

export const metadata: Metadata = { title: "Verify email" };
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (token) {
    const ok = await verifyEmail(getDb(), token);
    return (
      <>
        <h1 className="text-xl font-bold">{ok ? "Email verified" : "Link not valid"}</h1>
        <p className="mt-2 text-sm text-ink-600">
          {ok ? "Thanks, your email address is confirmed." : "This verification link is invalid, already used or expired. Sign in to request a new one."}
        </p>
        <Link href="/app" className={buttonClass("primary", "md", "mt-6 w-full")}>Continue</Link>
      </>
    );
  }
  const actor = await getActor();
  return (
    <>
      <h1 className="text-xl font-bold">Verify your email</h1>
      <p className="mt-2 text-sm text-ink-600">
        We sent a verification link to {actor ? <strong>{actor.user.email}</strong> : "your email address"}. Open it to continue setting up your organisation.
      </p>
      {actor && !actor.user.emailVerified && (
        <div className="mt-6">
          <ActionForm action={resendVerificationAction}>
            <SubmitButton variant="secondary" className="w-full">Resend verification email</SubmitButton>
          </ActionForm>
        </div>
      )}
    </>
  );
}
