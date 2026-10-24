import { BadgeIndianRupee, Inbox, Target, Wallet } from "lucide-react";
import { Alert, Card, CardHeader, Stat } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { StackedBarChart } from "@/components/charts/bar-chart";
import { SERIES_COLORS } from "@/components/charts/colors";
import { formatINR } from "@/lib/money";
import { formatNumber, formatPercent, relativeAge } from "@/lib/format";
import type { Report } from "@/server/services/reports";

const PROVIDER = { meta: "Meta Ads", google: "Google Ads" } as const;

function rupees(paise: number) {
  return formatINR(paise, { decimals: false });
}

function responseTime(minutes: number | null) {
  if (minutes === null) return "–";
  return minutes < 120 ? `${Math.round(minutes)} min` : `${(minutes / 60).toFixed(1)} h`;
}

/** The four headline figures: spend, budget, enquiries and cost per enquiry. */
export function KpiGrid({ report }: { report: Report }) {
  const t = report.totals;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <Stat label="Provider-reported spend" value={rupees(t.spend)} hint="Meta + Google (additive)" icon={<Wallet />} />
      <Stat label="Approved budget" value={rupees(t.approved)} hint={`Planned ${rupees(t.planned)} in period`} icon={<BadgeIndianRupee />} />
      <Stat label="Enquiries captured" value={formatNumber(t.leads)} hint="Duplicates excluded" icon={<Inbox />} href="/app/leads" />
      <Stat label="Cost per enquiry" value={t.leads && t.spend ? rupees(Math.round(t.spend / t.leads)) : "–"} hint={t.spend ? "Reported spend ÷ enquiries" : "Needs provider-reported spend"} icon={<Target />} />
    </div>
  );
}

/**
 * Enquiry to sale funnel as a ranked bar list. Every stage is labelled with its
 * count and its rate from the previous stage, so nothing relies on bar length alone.
 */
export function FunnelCard({ report }: { report: Report }) {
  const t = report.totals;
  const stages = [
    { label: "Enquiries", value: t.leads },
    { label: "Qualified", value: t.qualified },
    { label: "Test drives", value: t.testDrives },
    { label: "Bookings", value: t.bookings },
    { label: "Sales", value: t.sales },
  ];
  const top = Math.max(1, t.leads);
  return (
    <Card>
      <CardHeader title="Enquiry funnel" description="Stages as marked by your team in the lead centre" />
      <ol className="space-y-3">
        {stages.map((s, i) => {
          const prev = i > 0 ? stages[i - 1].value : null;
          const rate = prev ? s.value / prev : null;
          return (
            <li key={s.label}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-ink-800">{s.label}</span>
                <span className="tabular-nums text-ink-950">
                  <span className="font-semibold">{formatNumber(s.value)}</span>
                  {i > 0 && <span className="ml-2 text-xs text-ink-500">{rate === null ? "–" : formatPercent(rate, 0)} of previous</span>}
                </span>
              </div>
              <div className="h-2 rounded-full bg-ink-100" aria-hidden>
                <div className="h-2 rounded-full bg-road-600" style={{ width: `${Math.max(s.value ? 2 : 0, (s.value / top) * 100)}%`, opacity: 1 - i * 0.12 }} />
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-ink-100 pt-4 text-sm">
        <div>
          <div className="text-[13px] text-ink-500">Avg first response</div>
          <div className="mt-0.5 font-semibold tabular-nums">{responseTime(t.avgResponseMinutes)}</div>
          <div className="text-xs text-ink-500">{t.responded} of {t.leads} responded</div>
        </div>
        <div>
          <div className="text-[13px] text-ink-500">Cost per test drive</div>
          <div className="mt-0.5 font-semibold tabular-nums">{t.testDrives && t.spend ? rupees(Math.round(t.spend / t.testDrives)) : "–"}</div>
          <div className="text-xs text-ink-500">{t.spend ? "Reported spend ÷ test drives" : "Needs provider-reported spend"}</div>
        </div>
      </div>
    </Card>
  );
}

export function SpendChart({ report }: { report: Report }) {
  return (
    <Card>
      <StackedBarChart
        title="Provider-reported spend by day"
        format="inr"
        series={[{ key: "meta", label: "Meta Ads", color: SERIES_COLORS.slot1 }, { key: "google", label: "Google Ads", color: SERIES_COLORS.slot2 }]}
        data={report.daily.map((d) => ({ label: d.date, values: { meta: d.meta, google: d.google } }))}
        emptyText="No live provider data in this period"
      />
    </Card>
  );
}

export function EnquiryChart({ report }: { report: Report }) {
  return (
    <Card>
      <StackedBarChart title="Enquiries captured by day" format="count" series={[{ key: "leads", label: "Enquiries", color: SERIES_COLORS.slot1 }]} data={report.daily.map((d) => ({ label: d.date, values: { leads: d.leads } }))} emptyText="No enquiries in this period" />
    </Card>
  );
}

/** One compact card per platform, for the dashboard. */
export function PlatformCards({ report }: { report: Report }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {report.byProvider.map((p) => (
        <div key={p.provider} className="rounded-[var(--radius-card)] border border-ink-200/80 bg-white p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: p.provider === "meta" ? SERIES_COLORS.slot1 : SERIES_COLORS.slot2 }} />
              {PROVIDER[p.provider]}
            </span>
            {p.livePlatforms ? <Badge tone="ok">Live</Badge> : <Badge tone="neutral">No live campaigns</Badge>}
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <div><dt className="text-xs text-ink-500">Spend</dt><dd className="font-semibold tabular-nums">{p.hasData ? rupees(p.spend) : "–"}</dd></div>
            <div><dt className="text-xs text-ink-500">Clicks</dt><dd className="font-semibold tabular-nums">{p.hasData ? formatNumber(p.clicks) : "–"}</dd></div>
            <div><dt className="text-xs text-ink-500">Enquiries</dt><dd className="font-semibold tabular-nums">{formatNumber(p.attributedLeads)}</dd></div>
          </dl>
          <div className="mt-2 text-xs text-ink-500">{p.livePlatforms ? `Synced ${relativeAge(p.lastSynced)}` : "Figures appear after a live campaign syncs"}</div>
        </div>
      ))}
    </div>
  );
}

export function PlatformTable({ report }: { report: Report }) {
  return (
    <Card>
      <CardHeader title="By platform" description="Each platform's figures as it reports them, with its own attribution rules. Platform conversions are not added together." />
      <Table>
        <THead><tr><Th>Platform</Th><Th className="text-right">Spend</Th><Th className="text-right">Impressions</Th><Th className="text-right">Clicks</Th><Th className="text-right">CTR</Th><Th className="text-right">Platform conversions</Th><Th className="text-right">Captured enquiries</Th><Th className="text-right">Cost / enquiry</Th><Th>Last sync</Th></tr></THead>
        <TBody>
          {report.byProvider.map((p) => (
            <tr key={p.provider}>
              <Td className="whitespace-nowrap font-medium">{PROVIDER[p.provider]}</Td>
              <Td className="text-right tabular-nums">{p.hasData ? rupees(p.spend) : "–"}</Td>
              <Td className="text-right tabular-nums">{p.hasData ? formatNumber(p.impressions) : "–"}</Td>
              <Td className="text-right tabular-nums">{p.hasData ? formatNumber(p.clicks) : "–"}</Td>
              <Td className="text-right tabular-nums">{formatPercent(p.ctr, 2)}</Td>
              <Td className="text-right tabular-nums">{p.platformConversions === null ? "–" : formatNumber(p.platformConversions, 1)}</Td>
              <Td className="text-right tabular-nums">{formatNumber(p.attributedLeads)}</Td>
              <Td className="text-right tabular-nums">{p.costPerLead === null ? "–" : rupees(p.costPerLead)}</Td>
              <Td className="whitespace-nowrap text-xs">{p.livePlatforms ? relativeAge(p.lastSynced) : "No live campaigns"}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
      <p className="mt-3 text-xs text-ink-500">Meta conversions are “lead” actions under Meta&apos;s attribution setting; Google conversions use your Google Ads conversion actions. Captured enquiries are AutoSutra lead records attributed to the platform by source. Reach is not totalled because it is not additive.</p>
    </Card>
  );
}

function LocationTable({ report }: { report: Report }) {
  return (
    <Card>
      <CardHeader title="By location" />
      {report.byLocation.length === 0 ? (
        <p className="text-sm text-ink-500">No location data in this period.</p>
      ) : (
        <Table>
          <THead><tr><Th>Location</Th><Th className="text-right">Spend</Th><Th className="text-right">Clicks</Th><Th className="text-right">Enquiries</Th><Th className="text-right">Qualified</Th><Th className="text-right">Test drives</Th><Th className="text-right">Bookings</Th><Th className="text-right">Sales</Th><Th className="text-right">Cost / enquiry</Th><Th className="text-right">Cost / test drive</Th></tr></THead>
          <TBody>
            {report.byLocation.map((l) => (
              <tr key={l.locationId}>
                <Td className="font-medium">{l.name}</Td>
                <Td className="text-right tabular-nums">{rupees(l.spend)}</Td>
                <Td className="text-right tabular-nums">{formatNumber(l.clicks)}</Td>
                <Td className="text-right tabular-nums">{l.leads}</Td>
                <Td className="text-right tabular-nums">{l.qualified}</Td>
                <Td className="text-right tabular-nums">{l.testDrives}</Td>
                <Td className="text-right tabular-nums">{l.bookings}</Td>
                <Td className="text-right tabular-nums">{l.sales}</Td>
                <Td className="text-right tabular-nums">{l.costPerLead === null || !l.spend ? "–" : rupees(l.costPerLead)}</Td>
                <Td className="text-right tabular-nums">{l.costPerTestDrive === null || !l.spend ? "–" : rupees(l.costPerTestDrive)}</Td>
              </tr>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

function SourceList({ report }: { report: Report }) {
  const max = Math.max(1, ...report.bySource.map((s) => s.leads));
  return (
    <Card>
      <CardHeader title="Enquiries by source" />
      {!report.bySource.length ? (
        <p className="text-sm text-ink-500">No enquiries.</p>
      ) : (
        <ul className="space-y-2.5 text-sm">
          {report.bySource.map((s) => (
            <li key={s.source}>
              <div className="mb-1 flex justify-between gap-3"><span className="capitalize text-ink-800">{s.source.replace(/_/g, " ")}</span><span className="font-semibold tabular-nums">{s.leads}</span></div>
              <div className="h-1.5 rounded-full bg-ink-100" aria-hidden><div className="h-1.5 rounded-full bg-road-600" style={{ width: `${(s.leads / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function FreshnessWarnings({ report }: { report: Report }) {
  return report.warnings.length > 0 ? <Alert tone="warn" title="Data freshness">{report.warnings.join(" ")}</Alert> : null;
}

/** Full executive report (reports page and printable view). */
export function ReportView({ report }: { report: Report }) {
  return (
    <div className="space-y-6">
      <FreshnessWarnings report={report} />
      <KpiGrid report={report} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SpendChart report={report} />
          <EnquiryChart report={report} />
        </div>
        <div className="space-y-6">
          <FunnelCard report={report} />
          <SourceList report={report} />
        </div>
      </div>
      <PlatformTable report={report} />
      <LocationTable report={report} />
    </div>
  );
}
