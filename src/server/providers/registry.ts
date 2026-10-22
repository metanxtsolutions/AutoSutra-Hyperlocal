import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { advertisingConnections } from "../db/schema";
import { decryptSecret, encryptSecret } from "../crypto";
import { getEnv } from "../env";
import { DemoAdapter } from "./demo";
import { GoogleAdsAdapter, GoogleAdsClient, googleRefresh } from "./google";
import { defaultFetch } from "./http";
import { MetaAdapter, MetaClient } from "./meta";
import { ProviderError, type AdsAdapter, type FetchFn, type Provider } from "./types";

let fetchOverride: FetchFn | null = null;

/** Tests replace the HTTP layer with a mock provider API. */
export function setProviderFetchForTests(fn: FetchFn | null) {
  fetchOverride = fn;
}

export function providerFetch(): FetchFn {
  return fetchOverride ?? defaultFetch;
}

type Connection = typeof advertisingConnections.$inferSelect;

export async function getConnection(db: DbOrTx, organisationId: string, provider: Provider): Promise<Connection | null> {
  return (await db.query.advertisingConnections.findFirst({
    where: and(eq(advertisingConnections.organisationId, organisationId), eq(advertisingConnections.provider, provider)),
  })) ?? null;
}

function requireConnected(conn: Connection | null, provider: Provider): Connection {
  const name = provider === "meta" ? "Meta" : "Google Ads";
  if (!conn || !conn.accessTokenEnc) throw new ProviderError(`${name} is not connected for this organisation`, "auth");
  if (conn.status === "revoked" || conn.status === "expired") throw new ProviderError(`${name} connection is ${conn.status}. Reconnect it in Ad accounts.`, "auth");
  return conn;
}

/** A Google access token, refreshed with the stored refresh token when it is about to expire. */
async function googleAccessToken(db: DbOrTx, conn: Connection): Promise<string> {
  const env = getEnv();
  if (conn.accessTokenEnc && conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() > Date.now() + 60_000) return decryptSecret(conn.accessTokenEnc);
  if (!conn.refreshTokenEnc) throw new ProviderError("Google Ads connection has no refresh token. Reconnect Google Ads.", "auth");
  const fresh = await googleRefresh({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, refreshToken: decryptSecret(conn.refreshTokenEnc), fetchFn: providerFetch() });
  await db
    .update(advertisingConnections)
    .set({ accessTokenEnc: encryptSecret(fresh.accessToken), tokenExpiresAt: fresh.expiresAt, lastCheckedAt: new Date() })
    .where(eq(advertisingConnections.id, conn.id));
  conn.accessTokenEnc = encryptSecret(fresh.accessToken);
  conn.tokenExpiresAt = fresh.expiresAt;
  return fresh.accessToken;
}

export function metaClientFor(conn: Connection): MetaClient {
  return new MetaClient(decryptSecret(conn.accessTokenEnc!), getEnv().META_GRAPH_VERSION, providerFetch());
}

export function googleClientFor(db: DbOrTx, conn: Connection, loginCustomerId?: string | null): GoogleAdsClient {
  const env = getEnv();
  return new GoogleAdsClient(
    { version: env.GOOGLE_ADS_API_VERSION, developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN, loginCustomerId: loginCustomerId ?? (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || null), initialStatus: env.GOOGLE_ADS_INITIAL_STATUS },
    () => googleAccessToken(db, conn),
    providerFetch(),
  );
}

/** The adapter for a publication in the given mode. Live adapters use the organisation's own connection. */
export async function adapterFor(db: DbOrTx, organisationId: string, provider: Provider, mode: "demo" | "live"): Promise<AdsAdapter> {
  if (mode === "demo") return new DemoAdapter(provider);
  const env = getEnv();
  const conn = requireConnected(await getConnection(db, organisationId, provider), provider);
  if (provider === "meta") {
    if (conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() < Date.now()) throw new ProviderError("The Meta access token has expired. Reconnect Meta.", "auth");
    return new MetaAdapter(decryptSecret(conn.accessTokenEnc!), env.META_GRAPH_VERSION, env.META_INITIAL_STATUS, providerFetch());
  }
  if (!env.GOOGLE_ADS_DEVELOPER_TOKEN) throw new ProviderError("GOOGLE_ADS_DEVELOPER_TOKEN is not configured", "not_configured");
  return new GoogleAdsAdapter(
    { version: env.GOOGLE_ADS_API_VERSION, developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN, loginCustomerId: env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || null, initialStatus: env.GOOGLE_ADS_INITIAL_STATUS },
    () => googleAccessToken(db, conn),
    providerFetch(),
  );
}
