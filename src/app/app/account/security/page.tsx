import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TextField } from "@/components/ui/fields";
import { currentSession } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { formatDateTime } from "@/lib/format";
import { enrolmentDetails, twoStepStatus } from "@/server/services/mfa";
import { redirect } from "next/navigation";
import { confirmTwoStepAction, disableTwoStepAction, regenerateCodesAction, startTwoStepAction } from "./actions";
import { HideOnSuccess, RecoveryCodes } from "./codes";

export const metadata: Metadata = { title: "Two-step verification" };

const codeField = { inputMode: "numeric" as const, autoComplete: "one-time-code", pattern: "[0-9 ]*", maxLength: 7 };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const s = await currentSession();
  if (!s) redirect("/login");
  const { actor } = s;
  const { required } = await searchParams;
  const db = getDb();
  const status = await twoStepStatus(db, actor.user.id);
  const enrolment = status.enabled ? null : await enrolmentDetails(db, actor);
  const staff = !!actor.user.platformRole;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/app/account" className="hover:underline">Your account</Link>}
        title="Two-step verification"
        description="After your password, sign-in asks for a 6-digit code from an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password and similar)."
      />
      <div className="grid max-w-3xl gap-6">
        {required === "staff" && !actor.mfaVerified && (
          <Alert tone="warn" title="Needed for AutoSutra staff tools">
            {status.enabled
              ? "This session was started without the two-step code. Sign out and sign in again with your code to use the admin console."
              : "Set up two-step verification to use the admin console."}
          </Alert>
        )}

        <Card>
          <CardHeader
            title="Status"
            actions={status.enabled ? <Badge tone="ok">On</Badge> : <Badge tone="warn">Off</Badge>}
          />
          {status.enabled ? (
            <p className="text-sm text-ink-700">
              On since {formatDateTime(status.enabledAt!)}. {status.recoveryCodesLeft} unused recovery code{status.recoveryCodesLeft === 1 ? "" : "s"}.
              {!actor.mfaVerified && " This session was started before two-step verification, so sign in again to use actions that need it."}
            </p>
          ) : (
            <p className="text-sm text-ink-700">
              {staff
                ? "Required for AutoSutra staff accounts."
                : "Recommended for owners and finance users. Required for wallet deposits and refund requests."}
            </p>
          )}
        </Card>

        {!status.enabled && !enrolment && (
          <Card>
            <CardHeader title="Set up" description="You need your phone with an authenticator app installed." />
            <ActionForm action={startTwoStepAction} showSuccess={false}>
              <SubmitButton>Set up two-step verification</SubmitButton>
            </ActionForm>
          </Card>
        )}

        {enrolment && (
          <Card>
            <CardHeader title="Scan and confirm" />
            <ActionForm action={confirmTwoStepAction} stayOnSuccess>
              <HideOnSuccess>
                <ol className="list-decimal space-y-4 pl-5 text-sm text-ink-700">
                  <li>
                    In your authenticator app, add an account and scan this code.
                    <div
                      className="mt-3 w-44 rounded-lg bg-white p-2 ring-1 ring-ink-200 [&>svg]:h-auto [&>svg]:w-full"
                      role="img"
                      aria-label="QR code for your authenticator app"
                      dangerouslySetInnerHTML={{ __html: enrolment.qrSvg }}
                    />
                    <p className="mt-2">
                      Cannot scan? Enter this key instead: <span className="font-mono text-ink-950 break-all">{enrolment.secret}</span>
                    </p>
                  </li>
                  <li>Enter the 6-digit code the app shows.</li>
                </ol>
                <TextField label="Code from the app" name="code" required {...codeField} className="max-w-48" />
                <SubmitButton>Turn on</SubmitButton>
              </HideOnSuccess>
              <RecoveryCodes />
            </ActionForm>
            <ActionForm action={startTwoStepAction} showSuccess={false} className="mt-4">
              <button type="submit" className="text-sm text-road-600 underline">Start again with a new code</button>
            </ActionForm>
          </Card>
        )}

        {status.enabled && (
          <Card>
            <CardHeader title="Recovery codes" description="Create a new set if you used some or think someone else has seen them. The old set stops working." />
            <ActionForm action={regenerateCodesAction} stayOnSuccess>
              <HideOnSuccess>
                <TextField label="Current code from your app" name="code" required {...codeField} className="max-w-48" />
                <SubmitButton variant="secondary">Create new recovery codes</SubmitButton>
              </HideOnSuccess>
              <RecoveryCodes />
            </ActionForm>
          </Card>
        )}

        {status.enabled && !staff && (
          <Card>
            <CardHeader title="Turn off" description="You will sign in with your password only. Wallet deposits and refund requests will not be available." />
            <ActionForm action={disableTwoStepAction}>
              <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
              <TextField label="Code from your app or a recovery code" name="code" required autoComplete="one-time-code" className="max-w-64" />
              <SubmitButton variant="danger">Turn off two-step verification</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
