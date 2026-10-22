import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { requireOrg } from "@/server/auth/context";
import { AppError } from "@/server/errors";
import { audit } from "@/server/audit";
import { buildReport, normaliseFilter } from "@/server/services/reports";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor?.membership) return new NextResponse("Unauthorised", { status: 401 });
  const orgId = actor.membership.organisationId;
  try {
    requireOrg(actor, orgId, "reports.export");
    const db = getDb();
    const f = normaliseFilter(Object.fromEntries(req.nextUrl.searchParams));
    const r = await buildReport(db, actor, orgId, f);
    const rows: unknown[][] = [];
    for (const m of r.campaigns) rows.push(["provider_metrics", m.date, m.provider, m.campaignName, m.locationName, m.impressions, m.clicks, (m.spend / 100).toFixed(2), m.conversions ?? "", "", "", "", ""]);
    for (const l of r.byLocation) rows.push(["location_summary", `${f.from}..${f.to}`, "", "", l.name, l.impressions, l.clicks, (l.spend / 100).toFixed(2), "", l.leads, l.testDrives, l.bookings, l.sales]);
    await audit(db, actor, { action: "report.exported", entityType: "organisation", entityId: orgId, organisationId: orgId, summary: `Exported report ${f.from} to ${f.to}`, data: { filter: f } });
    const csv = toCsv(["row_type", "date", "provider", "campaign", "location", "impressions", "clicks", "spend_inr", "platform_conversions", "captured_enquiries", "test_drives", "bookings", "sales"], rows);
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="autosutra-report-${f.from}-${f.to}.csv"` } });
  } catch (e) {
    if (e instanceof AppError) return new NextResponse(e.message, { status: e.status });
    throw e;
  }
}
