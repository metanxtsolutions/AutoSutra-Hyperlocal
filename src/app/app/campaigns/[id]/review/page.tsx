import type { Metadata } from "next";
import { BuilderSteps } from "@/components/app/builder-steps";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Alert, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { TextAreaField } from "@/components/ui/fields";
import { Checkbox } from "@/components/ui/form";
import { LocationMap } from "@/components/map/location-map";
import { RADIUS_DISCLAIMER } from "@/lib/geo";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { objectiveDef } from "@/lib/objectives";
import { can } from "@/server/auth/context";
import { requireOrgActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { checkReadiness, configSnapshot, getCampaign, hashSnapshot, platformBudget, totalBudget } from "@/server/services/campaigns";
import { fundingMode } from "@/server/services/funding";
import { balanceByCode, ACCOUNTS } from "@/server/services/ledger";
import { MODE_LABELS } from "@/server/providers/modes";
import { approveAction, requestChangesAction, submitAction } from "../../actions";
import { AdPreview } from "../ad-preview";
import { ReadinessList } from "../readiness-list";

export const metadata: Metadata = { title: "Review campaign" };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireOrgActor();
  const db = getDb();
  const full = await getCampaign(db, actor, id);
  const c = full.campaign;
  const readiness = await checkReadiness(db, full);
  const mode = await fundingMode(db);
  const available = mode === "central_wallet" ? await balanceByCode(db, ACCOUNTS.available(c.organisationId).code) : null;
  const hash = hashSnapshot(configSnapshot(full));
  const total = totalBudget(full);
  const canApprove = can(actor, c.organisationId, "campaign.approve") && c.status === "pending_approval";
  const canSubmit = can(actor, c.organisationId, "campaign.submit") && ["draft", "changes_requested"].includes(c.status);
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Campaigns", href: "/app/campaigns" }, { label: c.name, href: `/app/campaigns/${id}` }]}
        title="Review and submit"
        description="Everything that will be sent to the ad platforms. Approval authorises this exact configuration and budget."
        actions={<StatusBadge status={c.status} />}
      />
      {["draft", "changes_requested"].includes(c.status) && <BuilderSteps campaignId={id} current="review" />}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Summary" />
            <DescriptionList
              items={[
                { label: "Dealership and location", value: `${full.dealership.name}: ${full.primaryLocation.name}` },
                { label: "Objective", value: objectiveDef(c.objective)?.label },
                { label: "Vehicle or service", value: [c.brand, c.model, c.variant].filter(Boolean).join(" ") || "–" },
                { label: "Offer", value: c.offerHeadline ?? "–" },
                { label: "Starting price", value: c.startingPrice ? `${formatINR(c.startingPrice, { decimals: false })}${c.priceVerified ? " (verified)" : " (NOT verified)"}` : "–" },
                { label: "Finance terms", value: c.financeDetails ? `${c.financeDetails}${c.financeApproved ? " (lender approved)" : " (NOT approved)"}` : "–" },
                { label: "Disclaimer", value: c.disclaimer ?? "–" },
                { label: "Schedule", value: `${formatDate(c.startDate)} to ${formatDate(c.endDate)}` },
                { label: "Audience", value: `Age ${c.ageMin} to ${c.ageMax}${c.languages.length ? `; languages: ${c.languages.join(", ")}` : ""}; placements: ${c.placements.replace("_", " ")}` },
                { label: "Keywords (Google)", value: c.keywords.join(", ") || "–" },
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Platforms and budget" />
            <table className="min-w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-ink-500"><th className="py-1">Platform</th><th>Campaign type</th><th>Account</th><th>Mode</th><th className="text-right">Budget</th></tr></thead>
              <tbody>
                {full.platforms.map(({ platform: p, account }) => (
                  <tr key={p.id} className="border-t border-ink-100">
                    <td className="py-2 font-medium">{p.provider === "meta" ? "Meta Ads" : "Google Ads"}</td>
                    <td>{p.providerCampaignType}</td>
                    <td>{account ? `${account.name}${account.metaPageName ? ` / Page: ${account.metaPageName}` : ""}` : "–"}</td>
                    <td>{MODE_LABELS[readiness.modes[p.provider]]}</td>
                    <td className="text-right tabular-nums">{formatINR(platformBudget(full, p.id))}</td>
                  </tr>
                ))}
                <tr className="border-t border-ink-200 font-semibold"><td className="py-2" colSpan={4}>Total planned</td><td className="text-right tabular-nums">{formatINR(total)}</td></tr>
                <tr><td className="py-1 text-ink-600" colSpan={4}>Maximum authorised spend</td><td className="text-right tabular-nums">{formatINR(c.maxAuthorisedSpend)}</td></tr>
              </tbody>
            </table>
            <p className="mt-3 text-xs text-ink-500">
              Funding: {mode === "central_wallet" ? `reserved from your AutoSutra advertising wallet on approval (available now: ${formatINR(available)})` : "billed by the ad platforms to your own ad accounts"}.
              Estimated reach is not shown because no supported estimate is available from the platforms in this release.
            </p>
          </Card>
          <Card>
            <CardHeader title="Targeting" />
            <ul className="mb-3 space-y-1 text-sm">
              {full.targets.map(({ targeting: t, location: l }) => (
                <li key={t.id}>
                  <strong>{l.name}</strong>: {t.radiusKm} km radius{t.includePincodes.length ? `; plus PIN ${t.includePincodes.join(", ")}` : ""}{t.excludePincodes.length ? `; excluding ${t.excludePincodes.join(", ")}` : ""}
                  {t.overlapOverrideReason && <span className="text-warn-700"> (territory overlap override: {t.overlapOverrideReason})</span>}
                </li>
              ))}
            </ul>
            <LocationMap points={full.targets.map((t) => ({ id: t.location.id, name: t.location.name, lat: t.location.latitude, lng: t.location.longitude, radiusKm: t.targeting.radiusKm }))} height={260} />
            <p className="mt-2 text-xs text-ink-500">{RADIUS_DISCLAIMER}</p>
          </Card>
        </div>
        <div className="space-y-6">
          <AdPreview full={full} />
          <Card>
            <CardHeader title="Checks" description="Policy, account permissions, funding and format checks." />
            <ReadinessList readiness={readiness} />
          </Card>
          {canSubmit && (
            <Card>
              <ActionForm action={submitAction.bind(null, c.id)} showSuccess={false}>
                <p className="text-sm text-ink-600">Submitting sends this campaign to your approvers. You cannot edit it while it waits, unless an approver requests changes.</p>
                <SubmitButton>Submit for approval</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {canApprove && (
            <Card>
              <CardHeader title="Approve" description="Your approval is recorded with this exact configuration." />
              <ActionForm action={approveAction.bind(null, c.id)} showSuccess={false}>
                <input type="hidden" name="expectedHash" value={hash} />
                <Checkbox name="confirmBudget" label={<>I authorise spend of up to <strong>{formatINR(c.maxAuthorisedSpend)}</strong> for this campaign, with a planned budget of {formatINR(total)}.</>} />
                {c.claimsStatus === "pending" && <Checkbox name="confirmClaims" label="I confirm the prices, finance terms and offers in this campaign are accurate and authorised." />}
                <TextAreaField label="Note (optional)" name="note" rows={2} />
                <SubmitButton>Approve campaign</SubmitButton>
              </ActionForm>
              <div className="mt-6 border-t border-ink-100 pt-4">
                <ActionForm action={requestChangesAction.bind(null, c.id)} showSuccess={false}>
                  <TextAreaField label="Request changes instead" name="reason" rows={2} required />
                  <SubmitButton variant="secondary">Request changes</SubmitButton>
                </ActionForm>
              </div>
              <p className="mt-3 text-[11px] text-ink-400">Configuration fingerprint {hash.slice(0, 16)}…</p>
            </Card>
          )}
          {c.status === "pending_approval" && !canApprove && <Alert tone="info">Waiting for an approver in your organisation.</Alert>}
        </div>
      </div>
    </>
  );
}
