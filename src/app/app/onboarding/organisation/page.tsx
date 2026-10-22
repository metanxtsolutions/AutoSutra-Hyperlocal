import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, PageHeader } from "@/components/ui/card";
import { SelectField, TextField } from "@/components/ui/fields";
import { ORG_TYPE_OPTIONS } from "@/lib/catalog";
import { requireActor } from "@/server/auth/session";
import { createOrganisationAction } from "../actions";

export const metadata: Metadata = { title: "Create organisation" };

export default async function CreateOrgPage() {
  const actor = await requireActor();
  if (!actor.user.emailVerified) redirect("/verify-email");
  return (
    <>
      <PageHeader title="Create your organisation" description="The organisation holds your dealerships, locations, team, campaigns and billing." />
      <Card className="max-w-xl">
        <ActionForm action={createOrganisationAction} showSuccess={false}>
          <TextField label="Organisation name" name="name" required hint="Usually your trading name, e.g. Sharma Motors or the group name." />
          <SelectField label="Organisation type" name="type" required options={ORG_TYPE_OPTIONS} placeholder="Choose…" />
          <p className="text-xs text-ink-500">By creating an organisation you confirm you are authorised to act for this business and accept the Terms of Service on its behalf.</p>
          <SubmitButton>Create organisation</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
