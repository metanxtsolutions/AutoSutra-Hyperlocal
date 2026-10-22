/**
 * Advertising account connections (customer-owned Meta and Google accounts).
 *
 * Each organisation authorises AutoSutra with its own Meta / Google login.
 * Tokens are encrypted at rest (AES-256-GCM) and never sent to the browser.
 * OAuth state is random, single-use, bound to the user and organisation, and
 * expires after 10 minutes.
 */
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import type { Database, DbOrTx } from "../db/client";
import { advertisingConnections, dealerships, oauthStates, providerAccounts } from "../db/schema";
import { audit } from "../audit";
import { requireOrg, type Actor } from "../auth/context";
import { decryptSecret, encryptSecret, hashToken, randomToken } from "../crypto";
import { getEnv } from "../env";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { effectiveMode } from "../providers/modes";
import { googleAuthUrl, googleDiscover, googleExchangeCode, googleRevoke } from "../providers/google";
import { META_SCOPES, metaAuthUrl, metaDiscover, metaExchangeCode } from "../providers/meta";
import { googleClientFor, metaClientFor, providerFetch } from "../providers/registry";
import { ProviderError, type Provider } from "../providers/types";

export async function listConnections(db: DbOrTx, actor: Actor, organisationId: string) {
  requireOrg(actor, organisationId, "campaign.view");
  return db.select().from(advertisingConnections).where(eq(advertisingConnections.organisationId, organisationId));
}

export async function listProviderAccounts(db: DbOrTx, actor: Actor, organisationId: string, provider?: Provider) {
  requireOrg(actor, organisationId, "campaign.view");
  return db
    .select()
    .from(providerAccounts)
    .where(and(eq(providerAccounts.organisationId, organisationId), provider ? eq(providerAccounts.provider, provider) : undefined))
    .orderBy(asc(providerAccounts.name));
}

function providerConfig(provider: Provider) {
  const env = getEnv();
  if (provider === "meta") {
    if (!env.META_APP_ID || !env.META_APP_SECRET || !env.META_REDIRECT_URI) throw new ValidationError("Meta app credentials are not configured on this server (META_APP_ID, META_APP_SECRET, META_REDIRECT_URI).");
  } else if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    throw new ValidationError("Google OAuth credentials are not configured on this server (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI).");
  }
  return env;
}

/** Start OAuth: returns the provider authorisation URL. */
export async function startOAuth(db: Database, actor: Actor, organisationId: string, provider: Provider): Promise<string> {
  requireOrg(actor, organisationId, "connections.manage");
  if (actor.membership?.organisationId !== organisationId) throw new ForbiddenError("Ad accounts are connected by the customer organisation");
  const mode = await effectiveMode(db, provider);
  if (mode === "demo" || mode === "off") throw new ValidationError(`${provider === "meta" ? "Meta" : "Google Ads"} is in ${mode} mode on this platform, so accounts cannot be connected yet.`);
  const env = providerConfig(provider);
  const state = randomToken(24);
  await db.insert(oauthStates).values({ stateHash: hashToken(state), organisationId, userId: actor.user.id, provider, expiresAt: new Date(Date.now() + 10 * 60_000) });
  await audit(db, actor, { action: "connection.oauth_started", entityType: "advertising_connection", organisationId, summary: `Started ${provider} authorisation` });
  return provider === "meta"
    ? metaAuthUrl({ appId: env.META_APP_ID, redirectUri: env.META_REDIRECT_URI, state, version: env.META_GRAPH_VERSION })
    : googleAuthUrl({ clientId: env.GOOGLE_CLIENT_ID, redirectUri: env.GOOGLE_REDIRECT_URI, state });
}

/** Validate state and consume it. Throws on reuse, expiry, provider mismatch or a different user. */
export async function consumeOAuthState(db: DbOrTx, actor: Actor, provider: Provider, state: string) {
  const row = await db.query.oauthStates.findFirst({
    where: and(eq(oauthStates.stateHash, hashToken(state || "")), isNull(oauthStates.usedAt), gt(oauthStates.expiresAt, new Date())),
  });
  if (!row || row.provider !== provider || row.userId !== actor.user.id) {
    await audit(db, actor, { action: "connection.oauth_state_rejected", entityType: "advertising_connection", summary: `Rejected ${provider} OAuth callback with invalid state` });
    throw new ForbiddenError("This authorisation link is invalid or has expired. Start connecting again.");
  }
  await db.update(oauthStates).set({ usedAt: new Date() }).where(eq(oauthStates.id, row.id));
  return row;
}

export async function completeOAuth(db: Database, actor: Actor, provider: Provider, code: string, state: string) {
  const st = await consumeOAuthState(db, actor, provider, state);
  const organisationId = st.organisationId;
  requireOrg(actor, organisationId, "connections.manage");
  const env = providerConfig(provider);
  const fetchFn = providerFetch();
  let values: Partial<typeof advertisingConnections.$inferInsert>;
  let accounts: { externalId: string; name: string; currency: string | null; timezone: string | null; status: string; managerCustomerId?: string | null }[] = [];
  let pages: { id: string; name: string }[] = [];
  let missing: string[] = [];
  try {
    if (provider === "meta") {
      const tok = await metaExchangeCode({ appId: env.META_APP_ID, appSecret: env.META_APP_SECRET, redirectUri: env.META_REDIRECT_URI, code, version: env.META_GRAPH_VERSION, fetchFn });
      const tempConn = { accessTokenEnc: encryptSecret(tok.accessToken) } as typeof advertisingConnections.$inferSelect;
      const found = await metaDiscover(metaClientFor(tempConn));
      missing = found.missing;
      accounts = found.adAccounts;
      pages = found.pages;
      values = {
        accessTokenEnc: tempConn.accessTokenEnc,
        refreshTokenEnc: null,
        tokenExpiresAt: tok.expiresAt,
        grantedScopes: found.granted,
        externalUserId: found.userId,
        externalUserName: found.userName,
      };
    } else {
      const tok = await googleExchangeCode({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: env.GOOGLE_REDIRECT_URI, code, fetchFn });
      const tempConn = { id: "", accessTokenEnc: encryptSecret(tok.accessToken), refreshTokenEnc: encryptSecret(tok.refreshToken), tokenExpiresAt: tok.expiresAt } as typeof advertisingConnections.$inferSelect;
      missing = tok.scopes.includes("https://www.googleapis.com/auth/adwords") ? [] : ["https://www.googleapis.com/auth/adwords"];
      const found = await googleDiscover(googleClientFor(db, tempConn));
      accounts = found.filter((a) => !a.manager).map((a) => ({ ...a, managerCustomerId: env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || null }));
      values = { accessTokenEnc: tempConn.accessTokenEnc, refreshTokenEnc: tempConn.refreshTokenEnc, tokenExpiresAt: tok.expiresAt, grantedScopes: tok.scopes };
    }
  } catch (e) {
    const msg = e instanceof ProviderError ? e.message : "The provider did not complete the authorisation";
    await upsertConnection(db, organisationId, provider, { status: "error", lastError: msg, lastCheckedAt: new Date() });
    await audit(db, actor, { action: "connection.failed", entityType: "advertising_connection", organisationId, summary: `${provider} connection failed: ${msg}` });
    throw new ValidationError(msg);
  }
  const status = missing.length ? "access_pending" : "connected";
  await db.transaction(async (tx) => {
    const conn = await upsertConnection(tx, organisationId, provider, {
      ...values,
      mode: "live",
      status,
      connectedById: actor.user.id,
      lastCheckedAt: new Date(),
      lastError: missing.length ? `Missing permissions: ${missing.join(", ")}` : null,
    });
    for (const a of accounts) {
      await tx
        .insert(providerAccounts)
        .values({ organisationId, connectionId: conn.id, provider, externalId: a.externalId, name: a.name, currency: a.currency, timezone: a.timezone, status: a.status, managerCustomerId: a.managerCustomerId ?? null })
        .onConflictDoUpdate({
          target: [providerAccounts.organisationId, providerAccounts.provider, providerAccounts.externalId],
          set: { name: a.name, currency: a.currency, timezone: a.timezone, status: a.status, connectionId: conn.id, updatedAt: new Date() },
        });
    }
    await audit(tx, actor, {
      action: "connection.connected",
      entityType: "advertising_connection",
      entityId: conn.id,
      organisationId,
      summary: `${provider === "meta" ? "Meta" : "Google Ads"} ${status === "connected" ? "connected" : "connected with missing permissions"}: ${accounts.length} ad account(s)${pages.length ? `, ${pages.length} page(s)` : ""}`,
      data: { missing, accounts: accounts.map((a) => a.externalId) },
    });
  });
  return { status, missing, accounts: accounts.length, pages };
}

async function upsertConnection(db: DbOrTx, organisationId: string, provider: Provider, set: Partial<typeof advertisingConnections.$inferInsert>) {
  const [row] = await db
    .insert(advertisingConnections)
    .values({ organisationId, provider, mode: "live", status: "not_connected", ...set })
    .onConflictDoUpdate({ target: [advertisingConnections.organisationId, advertisingConnections.provider], set: { ...set, updatedAt: new Date() } })
    .returning();
  return row;
}

/** Facebook Pages the connected Meta user can advertise from. */
export async function listMetaPages(db: DbOrTx, actor: Actor, organisationId: string) {
  requireOrg(actor, organisationId, "connections.manage");
  const conn = await db.query.advertisingConnections.findFirst({ where: and(eq(advertisingConnections.organisationId, organisationId), eq(advertisingConnections.provider, "meta")) });
  if (!conn?.accessTokenEnc || conn.status === "revoked") return [];
  try {
    const res = await metaClientFor(conn).call("GET", "me/accounts", { fields: "id,name", limit: 200 });
    return ((res.data as { id: string; name: string }[]) ?? []).map((p) => ({ id: String(p.id), name: String(p.name) }));
  } catch {
    return [];
  }
}

export async function configureAccount(db: Database, actor: Actor, accountId: string, input: { selected: boolean; dealershipId?: string | null; metaPageId?: string | null; metaPageName?: string | null }) {
  const acct = await db.query.providerAccounts.findFirst({ where: eq(providerAccounts.id, accountId) });
  if (!acct) throw new NotFoundError("Not found");
  requireOrg(actor, acct.organisationId, "connections.manage");
  if (input.dealershipId) {
    const d = await db.query.dealerships.findFirst({ where: and(eq(dealerships.id, input.dealershipId), eq(dealerships.organisationId, acct.organisationId)) });
    if (!d) throw new ValidationError("Dealership not found");
  }
  if (acct.provider === "meta" && input.metaPageId && !/^\d{5,25}$/.test(input.metaPageId)) throw new ValidationError("Choose a valid Facebook Page");
  if (acct.currency && acct.currency !== "INR" && input.selected) throw new ValidationError(`This account bills in ${acct.currency}. Only INR accounts can be used.`);
  await db.transaction(async (tx) => {
    await tx
      .update(providerAccounts)
      .set({
        selected: input.selected,
        dealershipId: input.dealershipId ?? null,
        metaPageId: acct.provider === "meta" ? input.metaPageId ?? null : null,
        metaPageName: acct.provider === "meta" ? input.metaPageName ?? null : null,
      })
      .where(eq(providerAccounts.id, acct.id));
    await audit(tx, actor, { action: "connection.account_configured", entityType: "provider_account", entityId: acct.id, organisationId: acct.organisationId, summary: `${input.selected ? "Enabled" : "Disabled"} ad account ${acct.name}${input.metaPageName ? ` with Page ${input.metaPageName}` : ""}` });
  });
}

export async function disconnect(db: Database, actor: Actor, organisationId: string, provider: Provider) {
  requireOrg(actor, organisationId, "connections.manage");
  const conn = await db.query.advertisingConnections.findFirst({ where: and(eq(advertisingConnections.organisationId, organisationId), eq(advertisingConnections.provider, provider)) });
  if (!conn) return;
  // Best effort: revoke at the provider so the token cannot be used anywhere.
  try {
    if (provider === "google" && conn.refreshTokenEnc) await googleRevoke(decryptSecret(conn.refreshTokenEnc), providerFetch());
    if (provider === "meta" && conn.accessTokenEnc) await metaClientFor(conn).call("DELETE", "me/permissions");
  } catch (e) {
    console.error(JSON.stringify({ level: "warn", msg: "provider_revoke_failed", provider, error: e instanceof Error ? e.message : String(e) }));
  }
  await db.transaction(async (tx) => {
    await tx
      .update(advertisingConnections)
      .set({ status: "revoked", accessTokenEnc: null, refreshTokenEnc: null, tokenExpiresAt: null, lastError: null, lastCheckedAt: new Date() })
      .where(eq(advertisingConnections.id, conn.id));
    await tx.update(providerAccounts).set({ selected: false }).where(eq(providerAccounts.connectionId, conn.id));
    await audit(tx, actor, { action: "connection.disconnected", entityType: "advertising_connection", entityId: conn.id, organisationId, summary: `Disconnected ${provider}; tokens deleted` });
  });
}

/** Health check used by the scheduled automation scan and the admin console. */
export async function checkConnection(db: Database, connectionId: string) {
  const conn = await db.query.advertisingConnections.findFirst({ where: eq(advertisingConnections.id, connectionId) });
  if (!conn?.accessTokenEnc || conn.status === "revoked") return conn?.status ?? "not_connected";
  try {
    if (conn.provider === "meta") {
      if (conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() < Date.now()) throw new ProviderError("Meta access token expired", "auth");
      const perms = await metaClientFor(conn).call("GET", "me/permissions");
      const granted = ((perms.data as { permission: string; status: string }[]) ?? []).filter((p) => p.status === "granted").map((p) => p.permission);
      const missing = META_SCOPES.filter((s) => !granted.includes(s));
      await db.update(advertisingConnections).set({ status: missing.length ? "access_pending" : "connected", grantedScopes: granted, lastError: missing.length ? `Missing permissions: ${missing.join(", ")}` : null, lastCheckedAt: new Date() }).where(eq(advertisingConnections.id, conn.id));
      return missing.length ? "access_pending" : "connected";
    }
    await googleClientFor(db, conn).request("GET", "customers:listAccessibleCustomers");
    await db.update(advertisingConnections).set({ status: "connected", lastError: null, lastCheckedAt: new Date() }).where(eq(advertisingConnections.id, conn.id));
    return "connected";
  } catch (e) {
    const pe = e instanceof ProviderError ? e : new ProviderError(String(e), "unknown");
    const status = pe.kind === "auth" ? "expired" : pe.retryable ? conn.status : "error";
    await db.update(advertisingConnections).set({ status, lastError: pe.message.slice(0, 1000), lastCheckedAt: new Date() }).where(eq(advertisingConnections.id, conn.id));
    return status;
  }
}
