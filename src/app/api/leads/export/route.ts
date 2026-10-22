import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { exportLeadsCsvRows } from "@/server/services/leads";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor?.membership) return new NextResponse("Unauthorised", { status: 401 });
  try {
    const rows = await exportLeadsCsvRows(getDb(), actor, actor.membership.organisationId, Object.fromEntries(req.nextUrl.searchParams));
    const csv = toCsv(
      ["lead_id", "received_utc", "status", "name", "phone", "email", "vehicle_brand", "vehicle_model", "source", "location", "campaign", "assigned_to", "consent_given", "first_response_utc", "duplicate_of", "anonymised"],
      rows.map((r) => [r.lead.id, r.lead.createdAt.toISOString(), r.lead.status, r.lead.name, r.lead.phone, r.lead.email, r.lead.vehicleBrand, r.lead.vehicleModel, r.lead.source, r.locationName, r.campaignName, r.assigneeName, r.lead.consentGiven, r.lead.firstResponseAt?.toISOString(), r.lead.duplicateOfId, r.lead.anonymisedAt ? "yes" : ""]),
    );
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="autosutra-leads.csv"`, "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AppError) return new NextResponse(e.message, { status: e.status });
    throw e;
  }
}
