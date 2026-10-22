import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TextAreaField } from "@/components/ui/fields";
import { formatDateTime } from "@/lib/format";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getTicket } from "@/server/services/support";
import { replyAction } from "../actions";

export const metadata: Metadata = { title: "Ticket" };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireOrgActor();
  const { ticket, messages } = await getTicket(getDb(), actor, id);
  return (
    <>
      <PageHeader eyebrow={<Link href="/app/support" className="hover:underline">Support</Link>} title={ticket.subject} actions={<StatusBadge status={ticket.status} />} />
      <div className="max-w-3xl space-y-4">
        <Card><p className="whitespace-pre-line text-sm">{ticket.body}</p><p className="mt-2 text-xs text-ink-500">{formatDateTime(ticket.createdAt)}</p></Card>
        {messages.map(({ m, author, authorIsStaff }) => (
          <Card key={m.id} className={authorIsStaff ? "border-road-100 bg-road-100/20" : ""}>
            <div className="text-xs text-ink-500">{author}{authorIsStaff ? " (AutoSutra)" : ""} · {formatDateTime(m.createdAt)}</div>
            <p className="mt-1 whitespace-pre-line text-sm">{m.body}</p>
          </Card>
        ))}
        {ticket.status !== "closed" && (
          <Card>
            <ActionForm action={replyAction.bind(null, ticket.id)} resetOnSuccess>
              <TextAreaField label="Reply" name="body" required rows={3} />
              <SubmitButton>Send</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
