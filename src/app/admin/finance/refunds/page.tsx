import type { Metadata } from "next";
import { inArray } from "drizzle-orm";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TextField } from "@/components/ui/fields";
import { Modal } from "@/components/ui/modal";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { formatINR } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { hasPlatform } from "@/server/auth/context";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { organisations } from "@/server/db/schema";
import { listRefunds } from "@/server/services/wallet";
import { refundBankAction, refundDecisionAction, refundFailAction } from "../../actions";

export const metadata: Metadata = { title: "Refunds" };

export default async function RefundsPage() {
  const actor = await requireActor();
  const db = getDb();
  const rows = await listRefunds(db, actor);
  const orgs = rows.length ? await db.select({ id: organisations.id, name: organisations.name }).from(organisations).where(inArray(organisations.id, Array.from(new Set(rows.map((r) => r.organisationId))))) : [];
  const finance = hasPlatform(actor, "platform.finance");
  return (
    <>
      <PageHeader title="Refunds" description="Approving holds the amount from the customer's available balance and refunds it through the gateway. Refunds are not instant; banks take several working days." />
      <Table>
        <THead><tr><Th>Requested</Th><Th>Organisation</Th><Th className="text-right">Amount</Th><Th>Reason</Th><Th>Status</Th><Th>Details</Th><Th></Th></tr></THead>
        <TBody>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td className="text-xs">{formatDateTime(r.createdAt)}</Td>
              <Td className="text-sm">{orgs.find((o) => o.id === r.organisationId)?.name}</Td>
              <Td className="text-right tabular-nums">{formatINR(r.amount)}</Td>
              <Td className="max-w-xs text-xs">{r.reason}</Td>
              <Td><StatusBadge status={r.status} /></Td>
              <Td className="max-w-xs text-xs">{r.decisionNote}{r.gatewayRefundId && <div>Gateway {r.gatewayRefundId}</div>}{r.bankReference && <div>Bank {r.bankReference}</div>}{r.failureReason && <div className="text-bad-700">{r.failureReason}</div>}</Td>
              <Td className="text-right">
                {finance && r.status === "requested" && (
                  <div className="flex justify-end gap-2">
                    <Modal trigger="Approve" title={`Approve refund of ${formatINR(r.amount)}`} triggerVariant="primary">
                      <ActionForm action={refundDecisionAction.bind(null, r.id)}>
                        <input type="hidden" name="decision" value="approve" />
                        <TextField label={`Type the amount (${(r.amount / 100).toFixed(2)}) to confirm`} name="confirmAmount" required />
                        <TextField label="Note" name="note" />
                        <SubmitButton>Approve refund</SubmitButton>
                      </ActionForm>
                    </Modal>
                    <Modal trigger="Reject" title="Reject refund" triggerVariant="ghost">
                      <ActionForm action={refundDecisionAction.bind(null, r.id)}>
                        <input type="hidden" name="decision" value="reject" />
                        <TextField label="Reason (shown to customer)" name="note" required />
                        <SubmitButton variant="danger">Reject</SubmitButton>
                      </ActionForm>
                    </Modal>
                  </div>
                )}
                {finance && ["approved", "processing"].includes(r.status) && (
                  <div className="flex justify-end gap-2">
                    <Modal trigger="Completed by bank" title="Record bank transfer">
                      <ActionForm action={refundBankAction.bind(null, r.id)}>
                        <TextField label="Bank transfer reference (UTR)" name="reference" required />
                        <SubmitButton>Mark completed</SubmitButton>
                      </ActionForm>
                    </Modal>
                    <Modal trigger="Mark failed" title="Mark refund failed" triggerVariant="ghost">
                      <ActionForm action={refundFailAction.bind(null, r.id)}>
                        <TextField label="Reason" name="reason" required />
                        <SubmitButton variant="danger">Mark failed and return funds</SubmitButton>
                      </ActionForm>
                    </Modal>
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </>
  );
}
