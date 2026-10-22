import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { getEnv } from "@/server/env";
import { AppError } from "@/server/errors";
import { completeOAuth } from "@/server/services/connections";

export const dynamic = "force-dynamic";

function back(params: Record<string, string>) {
  return NextResponse.redirect(`${getEnv().APP_URL}/app/settings/connections?${new URLSearchParams(params)}`);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== "meta" && provider !== "google") return new NextResponse("Not found", { status: 404 });
  const actor = await getActor();
  if (!actor) return NextResponse.redirect(`${getEnv().APP_URL}/login`);
  const url = req.nextUrl;
  if (url.searchParams.get("error")) {
    return back({ error: `Authorisation was not completed: ${url.searchParams.get("error_description") ?? url.searchParams.get("error")}` });
  }
  try {
    const r = await completeOAuth(getDb(), actor, provider, url.searchParams.get("code") ?? "", url.searchParams.get("state") ?? "");
    return back(
      r.status === "connected"
        ? { notice: `Connected. Found ${r.accounts} ad account(s). Choose which to use below.` }
        : { error: `Connected, but these permissions were not granted: ${r.missing.join(", ")}. Reconnect and approve all requested permissions.` },
    );
  } catch (e) {
    return back({ error: e instanceof AppError ? e.message : "Connection failed. Please try again." });
  }
}
