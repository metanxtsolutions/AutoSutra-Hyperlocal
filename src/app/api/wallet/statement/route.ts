import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { walletOverview } from "@/server/services/wallet";
import { entryLines } from "@/server/services/ledger";
import { audit } from "@/server/audit";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor?.membership) return new NextResponse("Unauthorised", { status: 401 });
  const orgId = actor.membership.organisationId;
  const db = getDb();
  try {
    const sp = req.nextUrl.searchParams;
    const w = await walletOverview(db, actor, orgId, { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
    const lines = await entryLines(db, w.entries.map((e) => e.id));
    const rows = w.entries.map((e) => {
      const change = lines.filter((l) => l.entryId === e.id && l.code === `org:${orgId}:available`).reduce((s, l) => s + l.credit - l.debit, 0);
      return [e.createdAt.toISOString(), e.transactionId, e.type, e.memo, (e.amount / 100).toFixed(2), (change / 100).toFixed(2), e.currency, e.paymentReference ?? "", e.reconciliationReference ?? "", e.idempotencyKey];
    });
    await audit(db, actor, { action: "wallet.statement_exported", entityType: "organisation", entityId: orgId, organisationId: orgId, summary: `Exported wallet statement (${rows.length} rows)` });
    const csv = toCsv(["timestamp_utc", "transaction_id", "type", "description", "amount_inr", "available_balance_change_inr", "currency", "payment_reference", "reconciliation_reference", "idempotency_key"], rows);
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="autosutra-wallet-statement.csv"` } });
  } catch (e) {
    if (e instanceof AppError) return new NextResponse(e.message, { status: e.status });
    throw e;
  }
}
