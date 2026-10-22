import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Alert, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui/card";
import { StatusBadge, humanize } from "@/components/ui/badge";
import { SelectField, TextAreaField, TextField } from "@/components/ui/fields";
import { Modal } from "@/components/ui/modal";
import { formatDateTime } from "@/lib/format";
import { can } from "@/server/auth/context";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { LEAD_STATUSES, assignableUsers, getLead } from "@/server/services/leads";
import { anonymiseAction, updateLeadAction, withdrawConsentAction } from "../actions";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireOrgActor();
  const db = getDb();
  const { lead, activities, consents, duplicates } = await getLead(db, actor, id);
  const people = await assignableUsers(db, actor, lead.organisationId);
  const manage = can(actor, lead.organisationId, "lead.manage") && !lead.anonymisedAt;
  const assign = can(actor, lead.organisationId, "lead.assign");
  return (
    <>
      <PageHeader eyebrow={<Link href="/app/leads" className="hover:underline">Lead centre</Link>} title={lead.anonymisedAt ? "Anonymised lead" : lead.name ?? lead.phone ?? "Lead"} actions={<StatusBadge status={lead.status} />} />
      {lead.duplicateOfId && <div className="mb-4"><Alert tone="warn">This is a repeat enquiry. <Link className="underline" href={`/app/leads/${lead.duplicateOfId}`}>Open the original lead</Link>.</Alert></div>}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <DescriptionList
              items={[
                { label: "Mobile", value: lead.phone ?? "–" },
                { label: "Email", value: lead.email ?? "–" },
                { label: "Vehicle interest", value: [lead.vehicleBrand, lead.vehicleModel].filter(Boolean).join(" ") || "–" },
                { label: "Source", value: humanize(lead.source) },
                { label: "Received", value: formatDateTime(lead.createdAt) },
                { label: "First response", value: lead.firstResponseAt ? `${formatDateTime(lead.firstResponseAt)} (${Math.round((lead.firstResponseAt.getTime() - lead.createdAt.getTime()) / 60000)} min)` : "Not yet" },
                { label: "Test drive", value: lead.testDriveAt ? formatDateTime(lead.testDriveAt) : "–" },
                { label: "Message", value: lead.message ?? "–" },
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="History" />
            <ol className="space-y-3 text-sm">
              {activities.map(({ a, actorName }) => (
                <li key={a.id} className="border-l-2 border-ink-200 pl-3">
                  <div className="text-xs text-ink-500">{formatDateTime(a.createdAt)} · {actorName ?? "System"}</div>
                  <div>{a.kind === "status_change" ? <>Status {humanize(a.fromStatus)} → <strong>{humanize(a.toStatus)}</strong></> : humanize(a.kind)}{a.body && <span className="text-ink-700">: {a.body}</span>}</div>
                </li>
              ))}
            </ol>
            {duplicates.length > 0 && <p className="mt-3 text-xs text-ink-500">{duplicates.length} repeat enquiry(ies) linked to this lead.</p>}
          </Card>
        </div>
        <div className="space-y-6">
          {manage && (
            <Card>
              <CardHeader title="Update" />
              <ActionForm action={updateLeadAction.bind(null, lead.id)} resetOnSuccess>
                <SelectField label="Status" name="status" defaultValue={lead.status} options={LEAD_STATUSES.map((s) => ({ value: s, label: humanize(s) }))} />
                {assign && <SelectField label="Assigned to" name="assignedToId" defaultValue={lead.assignedToId ?? ""} placeholder="Unassigned" options={people.map((p) => ({ value: p.id, label: p.name }))} />}
                <TextField label="Test drive date and time (IST)" name="testDriveAt" type="datetime-local" />
                <TextAreaField label="Follow-up note" name="note" rows={3} />
                <SubmitButton>Save</SubmitButton>
              </ActionForm>
            </Card>
          )}
          <Card>
            <CardHeader title="Consent" />
            <ul className="space-y-2 text-xs">
              {consents.map((c) => (
                <li key={c.id} className="rounded bg-ink-50 p-2">
                  <div className="font-medium">{c.granted ? "Granted" : "Not granted"} · {formatDateTime(c.capturedAt)} · {humanize(c.source)}</div>
                  <div className="text-ink-600">{c.noticeText}</div>
                  {c.withdrawnAt && <div className="font-medium text-bad-700">Withdrawn {formatDateTime(c.withdrawnAt)}</div>}
                </li>
              ))}
            </ul>
            {manage && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Modal trigger="Record consent withdrawal" title="Withdraw consent" triggerVariant="ghost">
                  <ActionForm action={withdrawConsentAction.bind(null, lead.id)}>
                    <p className="text-sm">Use this when the customer asks not to be contacted. Their personal details are removed immediately; the anonymous record stays for reporting.</p>
                    <SubmitButton variant="danger">Withdraw consent</SubmitButton>
                  </ActionForm>
                </Modal>
                {can(actor, lead.organisationId, "lead.delete") && (
                  <Modal trigger="Erase personal data" title="Erase personal data" triggerVariant="ghost">
                    <ActionForm action={anonymiseAction.bind(null, lead.id)}>
                      <TextAreaField label="Reason (e.g. data subject erasure request)" name="reason" required rows={2} />
                      <SubmitButton variant="danger">Erase</SubmitButton>
                    </ActionForm>
                  </Modal>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
