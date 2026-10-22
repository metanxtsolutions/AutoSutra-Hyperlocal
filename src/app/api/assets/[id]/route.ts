import { NextResponse } from "next/server";
import { getActor } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { getAssetForDownload } from "@/server/services/campaigns";
import { getObject } from "@/server/storage";

/** Streams a creative asset after checking the viewer may access its organisation. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) return new NextResponse("Unauthorised", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  try {
    const asset = await getAssetForDownload(getDb(), actor, id);
    const body = await getObject(asset.storageKey);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(body.length),
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${asset.filename.replace(/"/g, "")}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof AppError) return new NextResponse("Not found", { status: 404 });
    throw e;
  }
}
