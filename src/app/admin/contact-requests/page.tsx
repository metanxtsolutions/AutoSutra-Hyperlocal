import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listContactRequests } from "@/server/services/admin";
import { contactStatusAction } from "../actions";

export const metadata: Metadata = { title: "Contact requests" };

export default async function ContactRequests() {
  const actor = await requireActor();
  const rows = await listContactRequests(getDb(), actor);
  return (
    <>
      <PageHeader title="Contact requests" description="From the public website. The sender consented to be contacted about their enquiry only." />
      <Table>
        <THead><tr><Th>Received</Th><Th>From</Th><Th>Interest</Th><Th>Message</Th><Th>Status</Th><Th></Th></tr></THead>
        <TBody>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td className="text-xs">{formatDateTime(r.createdAt)}</Td>
              <Td className="text-sm">{r.name}<div className="text-xs text-ink-500">{r.email} {r.phone}</div><div className="text-xs text-ink-500">{r.company} {r.city}</div></Td>
              <Td className="text-xs">{r.interest.replace("_", " ")}</Td>
              <Td className="max-w-md whitespace-pre-line text-xs">{r.message}</Td>
              <Td><StatusBadge status={r.status === "new" ? "open" : r.status === "closed" ? "resolved" : "in_progress"} label={r.status} /></Td>
              <Td>
                <div className="flex gap-1">
                  {r.status === "new" && <ActionForm action={contactStatusAction.bind(null, r.id, "contacted")}><SubmitButton size="sm" variant="secondary">Contacted</SubmitButton></ActionForm>}
                  {r.status !== "closed" && <ActionForm action={contactStatusAction.bind(null, r.id, "closed")}><SubmitButton size="sm" variant="ghost">Close</SubmitButton></ActionForm>}
                </div>
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </>
  );
}
