import { Alert, Card, CardHeader, Stat } from "@/components/ui/card";
import { Table, TBody, Td, Th, THead } from "@/components/ui/table";
import { StackedBarChart, SERIES_COLORS } from "@/components/charts/bar-chart";
import { formatINR } from "@/lib/money";
import { formatNumber, formatPercent, relativeAge } from "@/lib/format";
import type { Report } from "@/server/services/reports";

const PROVIDER = { meta: "Meta Ads", google: "Google Ads" } as const;

/** Shared executive report body (dashboard and reports page). */
export function ReportView({ report, compact = false }: { report: Report; compact?: boolean }) {
  const t = report.totals;
  return (
    <div className="space-y-6">
      {report.warnings.length > 0 && <Alert tone="warn" title="Data freshness">{report.warnings.join(" ")}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Provider-reported spend" value={formatINR(t.spend, { decimals: false })} hint="Meta + Google (additive)" />
        <Stat label="Approved budget" value={formatINR(t.approved, { decimals: false })} hint={`Planned ${formatINR(t.planned, { decimals: false })}; campaigns in period`} />
        <Stat label="Enquiries captured" value={formatNumber(t.leads)} hint="AutoSutra lead records, duplicates excluded" />
        <Stat label="Cost per enquiry" value={t.leads ? formatINR(Math.round(t.spend / t.leads), { decimals: false }) : "–"} hint="Reported spend ÷ captured enquiries" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Qualified" value={formatNumber(t.qualified)} />
        <Stat label="Test drives completed" value={formatNumber(t.testDrives)} hint={t.testDrives ? `Cost per test drive ${formatINR(Math.round(t.spend / t.testDrives), { decimals: false })}` : "As marked by your team"} />
        <Stat label="Bookings" value={formatNumber(t.bookings)} hint="As marked by your team" />
        <Stat label="Sales" value={formatNumber(t.sales)} hint="Marked sold by your team" />
        <Stat label="Avg first response" value={t.avgResponseMinutes === null ? "–" : t.avgResponseMinutes < 120 ? `${Math.round(t.avgResponseMinutes)} min` : `${(t.avgResponseMinutes / 60).toFixed(1)} h`} hint={`${t.responded} of ${t.leads} responded`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <StackedBarChart
            title="Provider-reported spend by day"
            format="inr"
            series={[{ key: "meta", label: "Meta Ads", color: SERIES_COLORS.slot1 }, { key: "google", label: "Google Ads", color: SERIES_COLORS.slot2 }]}
            data={report.daily.map((d) => ({ label: d.date, values: { meta: d.meta, google: d.google } }))}
            emptyText="No live provider data in this period"
          />
        </Card>
        <Card>
          <StackedBarChart title="Enquiries captured by day" format="count" series={[{ key: "leads", label: "Enquiries", color: SERIES_COLORS.slot1 }]} data={report.daily.map((d) => ({ label: d.date, values: { leads: d.leads } }))} emptyText="No enquiries in this period" />
        </Card>
      </div>
      <Card>
        <CardHeader title="By platform" description="Each platform's figures as it reports them, with its own attribution rules. Platform conversions are not added together." />
        <Table>
          <THead><tr><Th>Platform</Th><Th className="text-right">Spend</Th><Th className="text-right">Impressions</Th><Th className="text-right">Clicks</Th><Th className="text-right">CTR</Th><Th className="text-right">Platform conversions</Th><Th className="text-right">Captured enquiries</Th><Th className="text-right">Cost / enquiry</Th><Th>Last sync</Th></tr></THead>
          <TBody>
            {report.byProvider.map((p) => (
              <tr key={p.provider}>
                <Td className="font-medium">{PROVIDER[p.provider]}</Td>
                <Td className="text-right tabular-nums">{p.hasData ? formatINR(p.spend, { decimals: false }) : "–"}</Td>
                <Td className="text-right tabular-nums">{p.hasData ? formatNumber(p.impressions) : "–"}</Td>
                <Td className="text-right tabular-nums">{p.hasData ? formatNumber(p.clicks) : "–"}</Td>
                <Td className="text-right tabular-nums">{formatPercent(p.ctr, 2)}</Td>
                <Td className="text-right tabular-nums">{p.platformConversions === null ? "–" : formatNumber(p.platformConversions, 1)}</Td>
                <Td className="text-right tabular-nums">{formatNumber(p.attributedLeads)}</Td>
                <Td className="text-right tabular-nums">{p.costPerLead === null ? "–" : formatINR(p.costPerLead, { decimals: false })}</Td>
                <Td className="text-xs">{p.livePlatforms ? relativeAge(p.lastSynced) : "No live campaigns"}</Td>
              </tr>
            ))}
          </TBody>
        </Table>
        <p className="mt-2 text-xs text-ink-500">Meta conversions are “lead” actions under Meta&apos;s attribution setting; Google conversions use your Google Ads conversion actions. Captured enquiries are AutoSutra lead records attributed to the platform by source. Reach is not totalled because it is not additive.</p>
      </Card>
      {!compact && (
        <>
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
                      <Td className="text-right tabular-nums">{formatINR(l.spend, { decimals: false })}</Td>
                      <Td className="text-right tabular-nums">{formatNumber(l.clicks)}</Td>
                      <Td className="text-right tabular-nums">{l.leads}</Td>
                      <Td className="text-right tabular-nums">{l.qualified}</Td>
                      <Td className="text-right tabular-nums">{l.testDrives}</Td>
                      <Td className="text-right tabular-nums">{l.bookings}</Td>
                      <Td className="text-right tabular-nums">{l.sales}</Td>
                      <Td className="text-right tabular-nums">{l.costPerLead === null ? "–" : formatINR(l.costPerLead, { decimals: false })}</Td>
                      <Td className="text-right tabular-nums">{l.costPerTestDrive === null ? "–" : formatINR(l.costPerTestDrive, { decimals: false })}</Td>
                    </tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
          <Card>
            <CardHeader title="Enquiries by source" />
            <ul className="grid gap-2 text-sm sm:grid-cols-3">
              {report.bySource.map((s) => <li key={s.source} className="flex justify-between rounded bg-ink-50 px-3 py-2"><span>{s.source.replace(/_/g, " ")}</span><span className="font-semibold tabular-nums">{s.leads}</span></li>)}
              {!report.bySource.length && <li className="text-ink-500">No enquiries.</li>}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
