import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { TextField } from "@/components/ui/fields";
import { Input } from "@/components/ui/form";
import { formatINR, rupeesInput } from "@/lib/money";
import { getDb } from "@/server/db/client";
import { fundingMode } from "@/server/services/funding";
import { totalBudget, type FullCampaign } from "@/server/services/campaigns";
import { budgetAction } from "../../actions";

export async function BudgetStep({ full }: { full: FullCampaign }) {
  const c = full.campaign;
  const mode = await fundingMode(getDb());
  if (!full.platforms.length) return <Alert tone="warn">Choose at least one platform first.</Alert>;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <ActionForm action={budgetAction.bind(null, c.id)} showSuccess={false}>
          <CardHeader title="Schedule" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Start date" name="startDate" type="date" required defaultValue={c.startDate ?? ""} />
            <TextField label="End date" name="endDate" type="date" required defaultValue={c.endDate ?? ""} hint="Up to 180 days." />
          </div>
          <CardHeader title="Budget by platform and location" description="Lifetime budget for the whole schedule. Daily budget is optional and helps pacing." />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-ink-500">
                  <th className="py-2 pr-3">Platform</th>
                  <th className="py-2 pr-3">Location</th>
                  <th className="py-2 pr-3">Lifetime (₹)</th>
                  <th className="py-2">Daily (₹, optional)</th>
                </tr>
              </thead>
              <tbody>
                {full.platforms.flatMap(({ platform: p }) =>
                  full.targets.map(({ location: l }) => {
                    const key = `${p.id}:${l.id}`;
                    const b = full.budgets.find((x) => x.campaignPlatformId === p.id && x.locationId === l.id);
                    return (
                      <tr key={key} className="border-t border-ink-100">
                        <td className="py-2 pr-3 font-medium">{p.provider === "meta" ? "Meta" : "Google"}</td>
                        <td className="py-2 pr-3">{l.name}</td>
                        <td className="py-2 pr-3"><Input aria-label={`${p.provider} ${l.name} lifetime budget`} name={`alloc_lifetime_${key}`} inputMode="decimal" defaultValue={rupeesInput(b?.lifetimeBudget)} /></td>
                        <td className="py-2"><Input aria-label={`${p.provider} ${l.name} daily budget`} name={`alloc_daily_${key}`} inputMode="decimal" defaultValue={rupeesInput(b?.dailyBudget)} /></td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
          <CardHeader title="Spending controls" />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Maximum authorised spend (₹)" name="maxAuthorisedSpend" inputMode="decimal" required defaultValue={rupeesInput(c.maxAuthorisedSpend)} hint="The most you authorise for this campaign across all platforms. Operators cannot raise it." />
            <TextField label="Alert threshold (%)" name="alertThresholdPct" type="number" min={10} max={100} defaultValue={String(c.alertThresholdPct)} hint="Notify when reported spend reaches this share of the budget." />
          </div>
          <SubmitButton>Save and continue</SubmitButton>
        </ActionForm>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Budget summary" />
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt>Planned budget</dt><dd className="font-semibold tabular-nums">{formatINR(totalBudget(full))}</dd></div>
            <div className="flex justify-between"><dt>Maximum authorised</dt><dd className="tabular-nums">{formatINR(c.maxAuthorisedSpend)}</dd></div>
            <div className="flex justify-between"><dt>Funding model</dt><dd>{mode === "central_wallet" ? "AutoSutra wallet" : "Billed by ad platforms"}</dd></div>
          </dl>
        </Card>
        <Alert tone="info" title="How budgets are controlled">
          Budgets are set on the ad platform. Platforms report spend with a delay, so spend can briefly pass a threshold before a pause takes effect. AutoSutra syncs spend regularly and alerts you at your threshold.
        </Alert>
        {mode === "dealer_funded" && <Alert tone="info">Your ad accounts are billed directly by Meta and Google. AutoSutra records the budgets you approve and the spend platforms report; it does not hold your advertising money.</Alert>}
        {mode === "central_wallet" && <Alert tone="warn">Approval reserves this budget from your advertising wallet. If the wallet balance is too low, the campaign waits for funds.</Alert>}
      </div>
    </div>
  );
}
