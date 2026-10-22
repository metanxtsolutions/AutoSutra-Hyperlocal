import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { formatDateTime } from "@/lib/format";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listOrgTickets } from "@/server/services/support";
import { createTicketAction } from "./actions";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage() {
  const actor = await requireOrgActor();
  const tickets = await listOrgTickets(getDb(), actor, actor.membership.organisationId);
  return (
    <>
      <PageHeader title="Support" description="Questions, problems and data requests (access, correction or erasure of personal data)." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {tickets.length === 0 ? <EmptyState title="No tickets yet" /> : (
            <ul className="divide-y divide-ink-100 rounded-xl border border-ink-200 bg-white">
              {tickets.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <Link href={`/app/support/${t.id}`} className="font-medium text-road-600 hover:underline">{t.subject}</Link>
                    <div className="text-xs text-ink-500">{t.category.replace("_", " ")} · updated {formatDateTime(t.updatedAt)}</div>
                  </div>
                  <StatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <Card>
          <CardHeader title="New ticket" />
          <ActionForm action={createTicketAction} showSuccess={false}>
            <TextField label="Subject" name="subject" required />
            <SelectField label="Category" name="category" options={[{ value: "general", label: "General" }, { value: "campaign", label: "Campaign" }, { value: "billing", label: "Billing" }, { value: "wallet", label: "Advertising funds" }, { value: "account", label: "Account" }, { value: "data_request", label: "Personal data request" }, { value: "bug", label: "Something is broken" }]} />
            <SelectField label="Priority" name="priority" defaultValue="normal" options={[{ value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" }, { value: "urgent", label: "Urgent (campaign spending incorrectly)" }]} />
            <TextAreaField label="Description" name="body" required rows={5} />
            <SubmitButton>Create ticket</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
