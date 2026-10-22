import type { DbOrTx } from "../db/client";
import { getEnv } from "../env";
import { isEnabled } from "../flags";

export type Provider = "meta" | "google";

/**
 * Effective publishing mode for a provider.
 * - off:     publishing to this provider is disabled
 * - demo:    nothing is sent to the provider; results are labelled Demo
 * - pending: live mode is configured but an AutoSutra admin has not enabled it
 * - live:    real API calls (env ADS_*_MODE=live AND feature flag on)
 */
export type EffectiveMode = "off" | "demo" | "pending" | "live";

export async function effectiveMode(db: DbOrTx, provider: Provider): Promise<EffectiveMode> {
  const env = getEnv();
  const configured = provider === "meta" ? env.ADS_META_MODE : env.ADS_GOOGLE_MODE;
  if (configured === "off") return "off";
  if (configured === "demo") return "demo";
  const flag = await isEnabled(db, provider === "meta" ? "live_meta_publishing" : "live_google_publishing");
  return flag ? "live" : "pending";
}

export const MODE_LABELS: Record<EffectiveMode, string> = {
  off: "Disabled",
  demo: "Demo mode",
  pending: "Access pending",
  live: "Live",
};
