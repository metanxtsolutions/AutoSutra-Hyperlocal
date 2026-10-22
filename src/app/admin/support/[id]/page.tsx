import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { SelectField, TextAreaField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form";
import { formatDateTime } from "@/lib/format";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getTicket } from "@/server/services/support";
import { staffReplyAction } from "../../actions";

export const metadata: Metadata = { title: "Ticket" };

export default async function AdminTicket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const { ticket, messages } = await getTicket(getDb(), actor, id);
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/support" className="hover:underline">Support</Link>} title={ticket.subject} description={`${ticket.category} · ${ticket.priority}`} actions={<StatusBadge status={ticket.status} />} />
      <div className="max-w-3xl space-y-4">
        <Card><p className="whitespace-pre-line text-sm">{ticket.body}</p><p className="mt-2 text-xs text-ink-500">{formatDateTime(ticket.createdAt)}</p></Card>
        {messages.map(({ m, author, authorIsStaff }) => (
          <Card key={m.id} className={m.internal ? "border-warn-100 bg-warn-100/30" : authorIsStaff ? "bg-road-100/20" : ""}>
            <div className="text-xs text-ink-500">{author}{m.internal ? " · internal note" : ""} · {formatDateTime(m.createdAt)}</div>
            <p className="mt-1 whitespace-pre-line text-sm">{m.body}</p>
          </Card>
        ))}
        <Card>
          <ActionForm action={staffReplyAction.bind(null, id)} resetOnSuccess>
            <TextAreaField label="Reply" name="body" required rows={3} />
            <Checkbox name="internal" label="Internal note (not visible to the customer)" />
            <SelectField label="Status" name="status" defaultValue={ticket.status} options={["open", "in_progress", "waiting_on_customer", "resolved", "closed"].map((s) => ({ value: s, label: s.replace(/_/g, " ") }))} />
            <SubmitButton>Send</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
