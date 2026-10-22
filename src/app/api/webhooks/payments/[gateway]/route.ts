import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { handleWebhook } from "@/server/services/payments";

export const dynamic = "force-dynamic";

/** Payment gateway webhooks. The signature is verified over the exact raw body before anything is processed. */
export async function POST(req: Request, { params }: { params: Promise<{ gateway: string }> }) {
  const { gateway } = await params;
  const raw = await req.text();
  if (raw.length > 512 * 1024) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const result = await handleWebhook(getDb(), gateway, raw, req.headers);
  return NextResponse.json({ outcome: result.outcome }, { status: result.status });
}
