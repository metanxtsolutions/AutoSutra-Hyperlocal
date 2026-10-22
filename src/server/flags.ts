import { eq } from "drizzle-orm";
import type { DbOrTx } from "./db/client";
import { featureFlags, systemSettings } from "./db/schema";
import { audit } from "./audit";
import { requirePlatform, type Actor } from "./auth/context";
import { ValidationError } from "./errors";

/**
 * Feature flags gate anything with money or live-provider consequences.
 * All default to OFF. A flag alone never enables live behaviour: the matching
 * environment configuration must also be present (see services/funding.ts and
 * providers/registry.ts).
 */
export const FLAG_DEFINITIONS = {
  central_wallet: "Central advertising-budget wallet (AutoSutra collects and allocates ad budgets). Enable only after the funding structure has legal, payment-provider and ad-platform approval.",
  live_deposit_collection: "Accept advertising-budget deposits through the live payment gateway.",
  live_meta_publishing: "Allow publishing to Meta in live mode (requires ADS_META_MODE=live and Meta app approval).",
  live_google_publishing: "Allow publishing to Google Ads in live mode (requires ADS_GOOGLE_MODE=live and developer token approval).",
  self_registration: "Allow anyone to register an organisation from the public website.",
  managed_service_requests: "Allow customers to request AutoSutra-managed campaign service.",
} as const;
export type FlagKey = keyof typeof FLAG_DEFINITIONS;

const DEFAULTS: Record<FlagKey, boolean> = {
  central_wallet: false,
  live_deposit_collection: false,
  live_meta_publishing: false,
  live_google_publishing: false,
  self_registration: true,
  managed_service_requests: true,
};

export async function isEnabled(db: DbOrTx, key: FlagKey): Promise<boolean> {
  const row = await db.query.featureFlags.findFirst({ where: eq(featureFlags.key, key) });
  return row ? row.enabled : DEFAULTS[key];
}

export async function allFlags(db: DbOrTx): Promise<{ key: FlagKey; enabled: boolean; description: string; updatedAt: Date | null }[]> {
  const rows = await db.select().from(featureFlags);
  return (Object.keys(FLAG_DEFINITIONS) as FlagKey[]).map((key) => {
    const row = rows.find((r) => r.key === key);
    return { key, enabled: row ? row.enabled : DEFAULTS[key], description: FLAG_DEFINITIONS[key], updatedAt: row?.updatedAt ?? null };
  });
}

export async function setFlag(db: DbOrTx, actor: Actor, key: FlagKey, enabled: boolean, reason: string): Promise<void> {
  requirePlatform(actor, "platform.admin");
  if (!(key in FLAG_DEFINITIONS)) throw new ValidationError("Unknown flag");
  if (!reason.trim()) throw new ValidationError("Record the reason for changing this flag");
  await db
    .insert(featureFlags)
    .values({ key, enabled, description: FLAG_DEFINITIONS[key], updatedById: actor.user.id })
    .onConflictDoUpdate({ target: featureFlags.key, set: { enabled, updatedById: actor.user.id, updatedAt: new Date() } });
  await audit(db, actor, {
    action: "flag.changed",
    entityType: "feature_flag",
    entityId: key,
    summary: `${enabled ? "Enabled" : "Disabled"} ${key}: ${reason.trim()}`,
    data: { key, enabled, reason: reason.trim() },
  });
}

export async function getSetting<T>(db: DbOrTx, key: string, fallback: T): Promise<T> {
  const row = await db.query.systemSettings.findFirst({ where: eq(systemSettings.key, key) });
  return row ? (row.value as T) : fallback;
}

export async function putSetting(db: DbOrTx, actor: Actor, key: string, value: unknown): Promise<void> {
  requirePlatform(actor, "platform.admin");
  await db
    .insert(systemSettings)
    .values({ key, value, updatedById: actor.user.id })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedById: actor.user.id, updatedAt: new Date() } });
  await audit(db, actor, { action: "setting.changed", entityType: "system_setting", entityId: key, summary: `Changed setting ${key}`, data: { value } });
}
