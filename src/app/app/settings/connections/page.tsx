import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Checkbox, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { relativeAge } from "@/lib/format";
import { requireOrg } from "@/server/auth/context";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { effectiveMode, MODE_LABELS } from "@/server/providers/modes";
import { listConnections, listMetaPages, listProviderAccounts } from "@/server/services/connections";
import { listDealerships } from "@/server/services/dealerships";
import { configureAccountAction, connectAction, disconnectAction } from "./actions";

export const metadata: Metadata = { title: "Ad accounts" };

const INFO = {
  meta: {
    name: "Meta Ads",
    perms: "ads_management, ads_read, business_management, pages_show_list, pages_read_engagement, pages_manage_ads",
    help: "Sign in with a Facebook user who has admin or advertiser access to your ad account and Facebook Page.",
  },
  google: {
    name: "Google Ads",
    perms: "Google Ads API access (https://www.googleapis.com/auth/adwords)",
    help: "Sign in with a Google account that has Standard or Admin access to your Google Ads account.",
  },
} as const;

export default async function ConnectionsPage() {
  const actor = await requireOrgActor();
  const orgId = actor.membership.organisationId;
  requireOrg(actor, orgId, "connections.manage");
  const db = getDb();
  const [connections, accounts, dealers, pages, metaMode, googleMode] = await Promise.all([
    listConnections(db, actor, orgId),
    listProviderAccounts(db, actor, orgId),
    listDealerships(db, actor, orgId),
    listMetaPages(db, actor, orgId),
    effectiveMode(db, "meta"),
    effectiveMode(db, "google"),
  ]);
  const modes = { meta: metaMode, google: googleMode };
  return (
    <>
      <PageHeader title="Ad accounts" description="Connect your own Meta and Google Ads accounts. Campaigns are published into, and billed by, the accounts you connect." />
      <div className="mb-6"><Alert tone="info">AutoSutra never uses a shared ad account for your campaigns. Each organisation authorises its own accounts, and you can disconnect at any time.</Alert></div>
      <div className="grid gap-6 lg:grid-cols-2">
        {(["meta", "google"] as const).map((p) => {
          const conn = connections.find((c) => c.provider === p);
          const accts = accounts.filter((a) => a.provider === p);
          const mode = modes[p];
          const status = conn?.status ?? "not_connected";
          return (
            <Card key={p}>
              <CardHeader
                title={INFO[p].name}
                description={INFO[p].help}
                actions={<><Badge tone={mode === "live" ? "ok" : mode === "demo" ? "demo" : mode === "pending" ? "warn" : "neutral"}>{MODE_LABELS[mode]}</Badge><StatusBadge status={status} /></>}
              />
              {mode === "demo" && <Alert tone="info" title="Demo mode">This platform has not enabled live {INFO[p].name} access yet. You can build and approve campaigns; publishing is simulated and nothing is sent to {INFO[p].name}.</Alert>}
              {mode === "pending" && <Alert tone="warn" title="Access pending">Live {INFO[p].name} access is configured but awaiting AutoSutra approval. You can connect your account now; publishing opens once access is approved.</Alert>}
              {mode === "off" && <Alert tone="warn">{INFO[p].name} publishing is disabled on this platform.</Alert>}
              {conn?.lastError && <div className="mt-3"><Alert tone="bad">{conn.lastError}</Alert></div>}
              <dl className="mt-3 space-y-1 text-sm text-ink-600">
                <div>Permissions requested: <span className="text-ink-800">{INFO[p].perms}</span></div>
                {conn?.externalUserName && <div>Authorised by: {conn.externalUserName}</div>}
                {conn?.tokenExpiresAt && <div>Access expires: {conn.tokenExpiresAt.toLocaleDateString("en-IN")}</div>}
                {conn && <div>Last checked: {relativeAge(conn.lastCheckedAt)}</div>}
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                {(mode === "live" || mode === "pending") && (
                  <ActionForm action={connectAction.bind(null, p)} showSuccess={false}>
                    <SubmitButton variant={status === "connected" ? "secondary" : "primary"}>{status === "connected" ? "Reconnect" : `Connect ${INFO[p].name}`}</SubmitButton>
                  </ActionForm>
                )}
                {conn && status !== "revoked" && (
                  <Modal trigger="Disconnect" title={`Disconnect ${INFO[p].name}?`} triggerVariant="ghost">
                    <ActionForm action={disconnectAction.bind(null, p)}>
                      <p className="text-sm">Stored tokens are deleted and access is revoked at {INFO[p].name}. Running campaigns keep running on the platform, but AutoSutra can no longer sync, pause or report on them.</p>
                      <SubmitButton variant="danger">Disconnect</SubmitButton>
                    </ActionForm>
                  </Modal>
                )}
              </div>
              {accts.length > 0 && (
                <div className="mt-5 space-y-3">
                  <h3 className="text-sm font-semibold">Ad accounts</h3>
                  {accts.map((a) => (
                    <div key={a.id} className="rounded-lg border border-ink-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-medium">{a.name}</span>
                        <span className="text-xs text-ink-500">{a.externalId} · {a.currency ?? "currency unknown"}</span>
                      </div>
                      <ActionForm action={configureAccountAction.bind(null, a.id)} className="mt-2 space-y-2">
                        <Checkbox name="selected" defaultChecked={a.selected} label="Use this account for campaigns" />
                        <Select name="dealershipId" defaultValue={a.dealershipId ?? ""} placeholder="All dealerships" options={dealers.map((d) => ({ value: d.id, label: d.name }))} aria-label="Dealership" />
                        {p === "meta" && (
                          <Select
                            name="page"
                            aria-label="Facebook Page"
                            defaultValue={a.metaPageId ? `${a.metaPageId}|${a.metaPageName ?? ""}` : ""}
                            placeholder={pages.length ? "Choose the Facebook Page for ads" : "No Pages available"}
                            options={pages.map((pg) => ({ value: `${pg.id}|${pg.name}`, label: pg.name }))}
                          />
                        )}
                        <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
                      </ActionForm>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
