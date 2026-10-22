import { NextResponse } from "next/server";
import { getEnv } from "@/server/env";

/**
 * Digital Asset Links, served at /.well-known/assetlinks.json (see next.config.ts).
 * Lets the AutoSutra Android app open this site full screen, without a browser bar.
 */
export function GET() {
  const env = getEnv();
  const fingerprints = env.ANDROID_APP_SHA256.split(",").map((f) => f.trim().toUpperCase()).filter(Boolean);
  const body =
    env.ANDROID_APP_PACKAGE && fingerprints.length
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: { namespace: "android_app", package_name: env.ANDROID_APP_PACKAGE, sha256_cert_fingerprints: fingerprints },
          },
        ]
      : [];
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
