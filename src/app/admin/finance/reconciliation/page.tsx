import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { SelectField, TextField } from "@/components/ui/fields";
import { Modal } from "@/components/ui/modal";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { formatINR } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { hasPlatform } from "@/server/auth/context";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { ADJUSTMENTS, listDifferences, listRuns } from "@/server/services/reconciliation";
import { approveAdjustmentAction, proposeAdjustmentAction, resolveDiffAction, runReconAction } from "../../actions";

export const metadata: Metadata = { title: "Reconciliation" };

export default async function ReconPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const actor = await requireActor();
  const db = getDb();
  const [diffs, runs] = await Promise.all([listDifferences(db, actor, all ? "all" : "open"), listRuns(db, actor)]);
  const finance = hasPlatform(actor, "platform.finance");
  return (
    <>
      <PageHeader title="Reconciliation" description="Ledger vs provider-reported spend vs gateway records. Runs daily; nothing is corrected automatically. Adjustments need two different finance users." actions={finance && <ActionForm action={runReconAction}><SubmitButton>Run now</SubmitButton></ActionForm>} />
      <Card>
        <CardHeader title={all ? "All differences" : "Open differences"} actions={<a className="text-sm text-road-600" href={all ? "?" : "?all=1"}>{all ? "Show open only" : "Show all"}</a>} />
        <Table>
          <THead><tr><Th>Kind</Th><Th>Organisation</Th><Th className="text-right">Amount</Th><Th>Detail</Th><Th>Status</Th><Th>Proposed adjustment</Th><Th></Th></tr></THead>
          <TBody>
            {diffs.map(({ d, organisationName }) => (
              <tr key={d.id}>
                <Td className="text-xs font-medium">{d.kind.replace(/_/g, " ")}</Td>
                <Td className="text-sm">{organisationName ?? "Platform"}</Td>
                <Td className="text-right tabular-nums">{formatINR(d.amount)}</Td>
                <Td className="max-w-sm text-xs">{d.detail}{d.resolutionNote && <div className="text-ink-500">Resolution: {d.resolutionNote}</div>}</Td>
                <Td><StatusBadge status={d.status} /></Td>
                <Td className="text-xs">{d.proposedAdjustment ? `${d.proposedAdjustment.kind.replace(/_/g, " ")} ${formatINR(d.proposedAdjustment.amount)}: ${d.proposedAdjustment.note}` : "–"}</Td>
                <Td className="text-right">
                  {finance && d.status === "open" && (
                    <div className="flex justify-end gap-2">
                      {d.campaignPlatformId && !d.proposedAdjustment && (
                        <Modal trigger="Propose adjustment" title="Propose adjustment">
                          <ActionForm action={proposeAdjustmentAction.bind(null, d.id)}>
                            <SelectField label="Adjustment" name="kind" options={Object.entries(ADJUSTMENTS).map(([value, label]) => ({ value, label }))} />
                            <TextField label="Amount (₹)" name="amount" inputMode="decimal" defaultValue={(d.amount / 100).toFixed(2)} required />
                            <TextField label="Justification" name="note" required />
                            <SubmitButton>Propose</SubmitButton>
                          </ActionForm>
                        </Modal>
                      )}
                      {d.proposedAdjustment && d.proposedById !== actor.user.id && (
                        <ActionForm action={approveAdjustmentAction.bind(null, d.id)}><SubmitButton size="sm">Approve adjustment</SubmitButton></ActionForm>
                      )}
                      <Modal trigger="Resolve" title="Resolve without adjustment" triggerVariant="ghost">
                        <ActionForm action={resolveDiffAction.bind(null, d.id)}>
                          <TextField label="How was it resolved?" name="note" required />
                          <SubmitButton>Resolve</SubmitButton>
                        </ActionForm>
                      </Modal>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </TBody>
        </Table>
        {!diffs.length && <p className="mt-2 text-sm text-ink-500">No differences.</p>}
      </Card>
      <Card className="mt-6">
        <CardHeader title="Recent runs" />
        <ul className="space-y-1 text-xs">{runs.map((r) => <li key={r.id}>{formatDateTime(r.startedAt)} · {r.status} · {JSON.stringify(r.summary)}</li>)}</ul>
      </Card>
    </>
  );
}
