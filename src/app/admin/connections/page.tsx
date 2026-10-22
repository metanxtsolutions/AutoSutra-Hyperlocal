import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { relativeAge } from "@/lib/format";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { jobHealth } from "@/server/services/admin";
import { checkConnectionAction } from "../actions";

export const metadata: Metadata = { title: "Provider connections" };

export default async function ConnectionsAdmin() {
  const actor = await requireActor();
  const { connections } = await jobHealth(getDb(), actor);
  return (
    <>
      <PageHeader title="Provider connections" description="Customer-owned Meta and Google Ads authorisations. Tokens are encrypted and never displayed." />
      <Table>
        <THead><tr><Th>Organisation</Th><Th>Provider</Th><Th>Status</Th><Th>Scopes</Th><Th>Token expires</Th><Th>Last checked</Th><Th>Last error</Th><Th></Th></tr></THead>
        <TBody>
          {connections.map(({ c, organisationName }) => (
            <tr key={c.id}>
              <Td>{organisationName}</Td>
              <Td>{c.provider}</Td>
              <Td><StatusBadge status={c.status} /></Td>
              <Td className="max-w-xs text-xs">{c.grantedScopes.join(", ") || "–"}</Td>
              <Td className="text-xs">{c.tokenExpiresAt?.toISOString().slice(0, 10) ?? "–"}</Td>
              <Td className="text-xs">{relativeAge(c.lastCheckedAt)}</Td>
              <Td className="max-w-xs text-xs text-bad-700">{c.lastError ?? ""}</Td>
              <Td>{c.accessTokenEnc && <ActionForm action={checkConnectionAction.bind(null, c.id)}><SubmitButton size="sm" variant="secondary">Check now</SubmitButton></ActionForm>}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </>
  );
}
