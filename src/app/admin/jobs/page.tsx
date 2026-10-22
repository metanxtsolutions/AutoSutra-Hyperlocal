import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { formatDateTime, relativeAge } from "@/lib/format";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { jobHealth } from "@/server/services/admin";
import { retryJobAction } from "../actions";

export const metadata: Metadata = { title: "Jobs & API health" };

export default async function JobsPage() {
  const actor = await requireActor();
  const h = await jobHealth(getDb(), actor);
  const types = Array.from(new Set(h.byStatus.map((r) => r.type)));
  return (
    <>
      <PageHeader title="Jobs and API health" description={`Oldest queued job due ${h.oldestQueued ? relativeAge(h.oldestQueued) : "none"}. Jobs run in the worker (npm run worker) or via /api/cron/run-jobs.`} />
      <Card>
        <CardHeader title="Queue" />
        <Table>
          <THead><tr><Th>Job type</Th>{["queued", "running", "succeeded", "failed", "dead"].map((s) => <Th key={s} className="text-right">{s}</Th>)}</tr></THead>
          <TBody>
            {types.map((t) => <tr key={t}><Td>{t}</Td>{["queued", "running", "succeeded", "failed", "dead"].map((s) => <Td key={s} className="text-right tabular-nums">{h.byStatus.find((r) => r.type === t && r.status === s)?.n ?? 0}</Td>)}</tr>)}
          </TBody>
        </Table>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Failed and dead jobs" />
        {h.problems.length === 0 ? <p className="text-sm text-ink-500">None.</p> : (
          <Table>
            <THead><tr><Th>Type</Th><Th>Status</Th><Th>Attempts</Th><Th>Last error</Th><Th>Updated</Th><Th></Th></tr></THead>
            <TBody>
              {h.problems.map((j) => (
                <tr key={j.id}>
                  <Td>{j.type}<div className="text-[11px] text-ink-400">{JSON.stringify(j.payload)}</div></Td>
                  <Td><StatusBadge status={j.status} /></Td>
                  <Td>{j.attempts}/{j.maxAttempts}</Td>
                  <Td className="max-w-md text-xs text-bad-700">{j.lastError}</Td>
                  <Td className="text-xs">{formatDateTime(j.updatedAt)}</Td>
                  <Td><ActionForm action={retryJobAction.bind(null, j.id)}><SubmitButton size="sm" variant="secondary">Retry</SubmitButton></ActionForm></Td>
                </tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Card className="mt-6">
        <CardHeader title="Recent failed publication attempts" />
        <ul className="space-y-2 text-sm">
          {h.failedAttempts.map(({ a, provider, campaignName, campaignId }) => (
            <li key={a.id}><Link href={`/admin/campaigns/${campaignId}`} className="text-road-600 hover:underline">{campaignName}</Link> · {provider} · attempt {a.attemptNo} · {formatDateTime(a.startedAt)}: <span className="text-bad-700">{a.error}</span>{a.retryable ? " (retried automatically)" : ""}</li>
          ))}
          {!h.failedAttempts.length && <li className="text-ink-500">None.</li>}
        </ul>
      </Card>
    </>
  );
}
