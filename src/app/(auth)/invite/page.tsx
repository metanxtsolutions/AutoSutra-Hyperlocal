import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { buttonClass } from "@/components/ui/button";
import { getActor } from "@/server/auth/session";
import { acceptInviteAction } from "../actions";

export const metadata: Metadata = { title: "Accept invitation" };
export const dynamic = "force-dynamic";

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const actor = await getActor();
  const back = `/invite?token=${encodeURIComponent(token)}`;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Join your team on AutoSutra</h1>
      {!actor ? (
        <>
          <p className="mt-2 text-sm text-ink-600">Sign in, or create an account with the email address the invitation was sent to.</p>
          <div className="mt-6 grid gap-2">
            <Link className={buttonClass("primary")} href={`/login?next=${encodeURIComponent(back)}`}>Log in</Link>
            <Link className={buttonClass("secondary")} href="/register">Create an account</Link>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-ink-600">Signed in as <strong>{actor.user.email}</strong>.</p>
          <div className="mt-6">
            <ActionForm action={acceptInviteAction} showSuccess={false}>
              <input type="hidden" name="token" value={token} />
              <SubmitButton className="w-full">Accept invitation</SubmitButton>
            </ActionForm>
          </div>
        </>
      )}
    </>
  );
}
