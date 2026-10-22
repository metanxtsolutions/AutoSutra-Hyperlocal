import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui/card";
import { TextField } from "@/components/ui/fields";
import { requireActor } from "@/server/auth/session";
import { changePasswordAction } from "./actions";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const actor = await requireActor();
  return (
    <>
      <PageHeader title="Your account" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" />
          <DescriptionList
            items={[
              { label: "Name", value: actor.user.name },
              { label: "Email", value: `${actor.user.email}${actor.user.emailVerified ? " (verified)" : " (not verified)"}` },
              { label: "Organisation", value: actor.membership?.organisationName ?? "–" },
            ]}
          />
          <p className="mt-4 text-xs text-ink-500">To export or delete your personal data, raise a request from Support. Requests are handled as described in the privacy policy.</p>
        </Card>
        <Card>
          <CardHeader title="Change password" />
          <ActionForm action={changePasswordAction} resetOnSuccess>
            <TextField label="Current password" name="currentPassword" type="password" autoComplete="current-password" required />
            <TextField label="New password" name="newPassword" type="password" autoComplete="new-password" required hint="At least 10 characters." />
            <TextField label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />
            <SubmitButton>Change password</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
