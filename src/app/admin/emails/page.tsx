import type { Metadata } from "next";
import { Alert, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { listEmails } from "@/server/services/admin";

export const metadata: Metadata = { title: "Emails" };

const TONES: Record<string, "ok" | "warn" | "bad" | "neutral" | "info"> = {
  sent: "ok",
  queued: "info",
  failed: "bad",
  not_delivered_no_provider: "warn",
  stored_for_development: "neutral",
};

export default async function EmailsPage() {
  const actor = await requireActor();
  const { rows, showBodies } = await listEmails(getDb(), actor);
  const undelivered = rows.some((r) => r.status === "not_delivered_no_provider" || r.status === "stored_for_development");
  return (
    <>
      <PageHeader title="Emails" description="The latest 200 messages AutoSutra sent or tried to send." />
      {undelivered && (
        <div className="mb-4">
          <Alert tone="warn" title="No email provider is configured">
            Messages are stored here but not delivered. Set EMAIL_DRIVER=smtp and the SMTP settings to send them.
            {showBodies && " On this non-production environment you can open a message below to use its link."}
          </Alert>
        </div>
      )}
      <Table>
        <THead><tr><Th>Created</Th><Th>To</Th><Th>Subject</Th><Th>Status</Th><Th>Attempts</Th></tr></THead>
        <TBody>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td className="text-xs">{formatDateTime(r.createdAt)}</Td>
              <Td className="text-sm">{r.to}</Td>
              <Td className="max-w-md text-sm">
                {r.subject}
                {r.body && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-road-600">Show message</summary>
                    <pre className="mt-2 whitespace-pre-wrap break-all rounded bg-ink-50 p-2 font-sans text-xs text-ink-800">{r.body}</pre>
                  </details>
                )}
                {r.lastError && <div className="mt-1 text-xs text-bad-700">{r.lastError}</div>}
              </Td>
              <Td><Badge tone={TONES[r.status] ?? "neutral"}>{r.status.replace(/_/g, " ")}</Badge></Td>
              <Td className="text-xs">{r.attempts}{r.sentAt ? ` · sent ${formatDateTime(r.sentAt)}` : ""}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </>
  );
}
