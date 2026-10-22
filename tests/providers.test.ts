import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { advertisingConnections, campaigns as campaignsTable, featureFlags, jobs, metricSnapshots, notifications, oauthStates, providerAccounts, publicationAttempts } from "@/server/db/schema";
import { encryptSecret, hashToken } from "@/server/crypto";
import { getEnv, resetEnvCache, setEnvForTests } from "@/server/env";
import { runAllHandlers } from "@/server/jobs/run";
import { setProviderFetchForTests } from "@/server/providers/registry";
import * as campaigns from "@/server/services/campaigns";
import * as publishing from "@/server/services/publishing";
import { consumeOAuthState } from "@/server/services/connections";
import { classifyMetaError } from "@/server/providers/meta";
import { classifyGoogleError } from "@/server/providers/google";
import { actorFor, makeTenant, makeUser, readyCampaign } from "./helpers";
import { metaHappyPath, mockProviders } from "./mock-providers";

async function approveCampaign(t: Awaited<ReturnType<typeof makeTenant>>, id: string) {
  const db = getDb();
  await campaigns.submitForApproval(db, t.actor, id);
  const full = await campaigns.loadCampaign(db, id);
  await campaigns.approve(db, t.actor, id, { confirmBudget: true, confirmClaims: true, expectedHash: campaigns.hashSnapshot(campaigns.configSnapshot(full!)) });
}

async function goLive(t: Awaited<ReturnType<typeof makeTenant>>, providers: ("meta" | "google")[]) {
  const db = getDb();
  setEnvForTests({ ADS_META_MODE: "live", ADS_GOOGLE_MODE: "live", GOOGLE_ADS_DEVELOPER_TOKEN: "dev-token", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "secret" });
  for (const key of ["live_meta_publishing", "live_google_publishing"]) {
    await db.insert(featureFlags).values({ key, enabled: true, description: "test" }).onConflictDoNothing();
  }
  const accounts: Record<string, string> = {};
  for (const p of providers) {
    const [conn] = await db
      .insert(advertisingConnections)
      .values({
        organisationId: t.org.id,
        provider: p,
        mode: "live",
        status: "connected",
        accessTokenEnc: encryptSecret(`${p}-access-token`),
        refreshTokenEnc: p === "google" ? encryptSecret("refresh-token") : null,
        tokenExpiresAt: new Date(Date.now() + 3600_000),
      })
      .returning();
    const [acct] = await db
      .insert(providerAccounts)
      .values({ organisationId: t.org.id, connectionId: conn.id, provider: p, externalId: p === "meta" ? "act_111" : "1234567890", name: `${p} account`, currency: "INR", metaPageId: p === "meta" ? "222333444" : null, selected: true })
      .returning();
    accounts[p] = acct.id;
  }
  return accounts;
}

let mock: ReturnType<typeof mockProviders>;
beforeEach(() => {
  mock = mockProviders();
  setProviderFetchForTests(mock.fetchFn);
});
afterEach(() => {
  setProviderFetchForTests(null);
  resetEnvCache();
});

describe("demo mode publishing", () => {
  it("records a demo publication, never reports active and never invents metrics", async () => {
    const db = getDb();
    const t = await makeTenant("Solo");
    const c = await readyCampaign(t, { providers: ["meta", "google"] });
    await approveCampaign(t, c.id);
    // Two simultaneous publish requests: exactly one wins, and only one job per platform is queued.
    const results = await Promise.allSettled([publishing.requestPublish(db, t.actor, c.id), publishing.requestPublish(db, t.actor, c.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(publishing.requestPublish(db, t.actor, c.id)).rejects.toThrow(/Only approved campaigns/);
    expect(await db.select().from(jobs)).toHaveLength(2);
    await runAllHandlers(db);
    const full = await campaigns.loadCampaign(db, c.id);
    expect(full!.campaign.status).toBe("demo_published");
    expect(full!.platforms.every((p) => p.platform.status === "demo" && p.platform.mode === "demo")).toBe(true);
    expect(mock.calls).toHaveLength(0); // nothing sent anywhere
    for (const p of full!.platforms) expect((await publishing.syncPlatform(db, p.platform.id)).skipped).toBe(true);
    expect(await db.select().from(metricSnapshots)).toHaveLength(0);
  });
});

describe("live publishing with mocked providers", () => {
  it("publishes to Meta, then sync reports provider status and metrics", async () => {
    const db = getDb();
    const t = await makeTenant("Solo");
    const accounts = await goLive(t, ["meta"]);
    const c = await readyCampaign(t, { providers: ["meta"] });
    await campaigns.setPlatforms(db, t.actor, c.id, { providers: ["meta"], metaAccountId: accounts.meta });
    await approveCampaign(t, c.id);
    metaHappyPath(mock, "PENDING_REVIEW");
    await publishing.requestPublish(db, t.actor, c.id);
    await runAllHandlers(db);
    let full = await campaigns.loadCampaign(db, c.id);
    const p = full!.platforms[0].platform;
    expect(p.mode).toBe("live");
    expect(p.status).toBe("pending_review");
    expect(full!.campaign.status).toBe("publishing"); // not active until Meta confirms
    expect(Object.keys(p.externalRefs)).toEqual(expect.arrayContaining(["campaign_id", "creative_id", `adset:${t.location.id}`, `ad:${t.location.id}`]));
    const adsetCall = mock.calls.find((x) => /adsets$/.test(x.url))!;
    const params = new URLSearchParams(adsetCall.body);
    expect(params.get("lifetime_budget")).toBe("1000000"); // ₹10,000 in paise
    expect(JSON.parse(params.get("targeting")!).geo_locations.custom_locations[0]).toMatchObject({ radius: 5, distance_unit: "kilometer" });
    expect(mock.calls.every((x) => !x.url.includes("access_token"))).toBe(true); // token sent in a header, not the URL

    // Meta now reports ACTIVE with two days of insights.
    metaHappyPath(mock, "ACTIVE");
    mock.on(/\/insights\?/, () => ({ body: { data: [
      { date_start: "2026-10-20", spend: "1500.50", impressions: "12000", reach: "8000", clicks: "240", account_currency: "INR", actions: [{ action_type: "lead", value: "6" }] },
      { date_start: "2026-10-21", spend: "999.50", impressions: "9000", reach: "6500", clicks: "180", account_currency: "INR" },
    ] } }));
    const r = await publishing.syncPlatform(db, p.id);
    expect(r).toMatchObject({ status: "active", cumulative: 250000 });
    full = await campaigns.loadCampaign(db, c.id);
    expect(full!.campaign.status).toBe("active");
    const snaps = await db.select().from(metricSnapshots);
    expect(snaps).toHaveLength(2);
    expect(snaps.find((s) => s.metricDate === "2026-10-20")).toMatchObject({ spend: 150050, clicks: 240, platformConversions: 6 });
  });

  it("retries after a rate limit without creating duplicate Meta objects", async () => {
    const db = getDb();
    const t = await makeTenant("Solo");
    const accounts = await goLive(t, ["meta"]);
    const c = await readyCampaign(t, { providers: ["meta"] });
    await campaigns.setPlatforms(db, t.actor, c.id, { providers: ["meta"], metaAccountId: accounts.meta });
    await approveCampaign(t, c.id);
    metaHappyPath(mock);
    mock.on(/\/adsets$/, () => ({ status: 400, body: { error: { message: "User request limit reached", code: 17 } } }), { method: "POST", times: 1 });
    await publishing.requestPublish(db, t.actor, c.id);
    await runAllHandlers(db);
    let platform = (await campaigns.loadCampaign(db, c.id))!.platforms[0].platform;
    expect(platform.status).toBe("queued");
    expect(platform.externalRefs.campaign_id).toBeTruthy(); // persisted before the failure
    // Make the backed-off job due now and run again.
    await db.update(jobs).set({ runAt: new Date() });
    await runAllHandlers(db);
    platform = (await campaigns.loadCampaign(db, c.id))!.platforms[0].platform;
    expect(platform.status).toBe("pending_review");
    expect(mock.count(/\/act_\d+\/campaigns$/, "POST")).toBe(1);
    expect(mock.count(/\/act_\d+\/adsets$/, "POST")).toBe(2);
    const attempts = await db.select().from(publicationAttempts).where(eq(publicationAttempts.campaignPlatformId, platform.id));
    expect(attempts.map((a) => a.status).sort()).toEqual(["failed", "succeeded"]);
  });

  it("reports partial publication when one platform fails and the other succeeds", async () => {
    const db = getDb();
    const t = await makeTenant("Solo");
    const accounts = await goLive(t, ["meta", "google"]);
    const c = await readyCampaign(t, { providers: ["meta", "google"] });
    await campaigns.setPlatforms(db, t.actor, c.id, { providers: ["meta", "google"], metaAccountId: accounts.meta, googleAccountId: accounts.google });
    await approveCampaign(t, c.id);
    metaHappyPath(mock, "ACTIVE");
    mock.on(/oauth2\.googleapis\.com\/token/, () => ({ body: { access_token: "g-access", expires_in: 3600 } }));
    mock.on(/googleads\.googleapis\.com/, () => ({ status: 403, body: { error: { status: "PERMISSION_DENIED", message: "The caller does not have permission", details: [{ errors: [{ errorCode: { authorizationError: "DEVELOPER_TOKEN_NOT_APPROVED" }, message: "Developer token is not approved" }] }] } } }));
    await publishing.requestPublish(db, t.actor, c.id);
    await runAllHandlers(db);
    const full = await campaigns.loadCampaign(db, c.id);
    const meta = full!.platforms.find((p) => p.platform.provider === "meta")!.platform;
    const google = full!.platforms.find((p) => p.platform.provider === "google")!.platform;
    expect(meta.status).toBe("active");
    expect(google.status).toBe("failed");
    expect(google.lastError).toMatch(/Developer token is not approved/);
    expect(full!.campaign.status).toBe("partially_published");
    const conn = await db.query.advertisingConnections.findFirst({ where: and(eq(advertisingConnections.organisationId, t.org.id), eq(advertisingConnections.provider, "google")) });
    expect(conn!.status).toBe("error");
    // Permission errors are not retried.
    expect((await db.select().from(jobs)).filter((j) => j.status === "queued")).toHaveLength(0);
  });

  it("publishes Google Search campaigns with proximity targeting and keywords", async () => {
    const db = getDb();
    const t = await makeTenant("Solo");
    const accounts = await goLive(t, ["google"]);
    const c = await readyCampaign(t, { providers: ["google"] });
    await campaigns.setPlatforms(db, t.actor, c.id, { providers: ["google"], googleAccountId: accounts.google });
    await approveCampaign(t, c.id);
    mock.on(/oauth2\.googleapis\.com\/token/, () => ({ body: { access_token: "g-access", expires_in: 3600 } }));
    mock.on(/:mutate$/, (call) => {
      const ops = JSON.parse(call.body).operations as unknown[];
      const res = call.url.split("/").pop()!.replace(":mutate", "");
      return { body: { results: ops.map((_, i) => ({ resourceName: `customers/1234567890/${res}/${mock.nextId()}${i}` })) } };
    });
    mock.on(/googleAds:search$/, () => ({ body: { results: [] } }));
    await publishing.requestPublish(db, t.actor, c.id);
    await runAllHandlers(db);
    const full = await campaigns.loadCampaign(db, c.id);
    const p = full!.platforms[0].platform;
    // With no status rows returned yet, the adapter must not claim the campaign is active.
    expect(p.status).not.toBe("active");
    const prox = mock.calls.find((x) => x.url.endsWith("campaignCriteria:mutate"))!;
    expect(JSON.parse(prox.body).operations[0].create.proximity).toMatchObject({ radius: 5, radiusUnits: "KILOMETERS" });
    const kw = mock.calls.find((x) => x.url.endsWith("adGroupCriteria:mutate"))!;
    expect(JSON.parse(kw.body).operations).toHaveLength(3);
    const google = mock.calls.find((x) => x.url.includes("googleads"))!;
    expect(google.url).toContain(`/${getEnv().GOOGLE_ADS_API_VERSION}/`);
  });

  it("marks an expired Meta token and notifies the organisation", async () => {
    const db = getDb();
    const t = await makeTenant("Solo");
    const accounts = await goLive(t, ["meta"]);
    const c = await readyCampaign(t, { providers: ["meta"] });
    await campaigns.setPlatforms(db, t.actor, c.id, { providers: ["meta"], metaAccountId: accounts.meta });
    await approveCampaign(t, c.id);
    metaHappyPath(mock, "ACTIVE");
    await publishing.requestPublish(db, t.actor, c.id);
    await runAllHandlers(db);
    mock.on(/graph\.facebook\.com/, () => ({ status: 400, body: { error: { message: "Error validating access token: Session has expired", code: 190 } } }));
    const p = (await campaigns.loadCampaign(db, c.id))!.platforms[0].platform;
    const r = await publishing.syncPlatform(db, p.id);
    expect(r.error).toMatch(/expired/);
    const conn = await db.query.advertisingConnections.findFirst({ where: eq(advertisingConnections.organisationId, t.org.id) });
    expect(conn!.status).toBe("expired");
    const n = await db.select().from(notifications).where(eq(notifications.kind, "connection_problem"));
    expect(n).toHaveLength(1);
    // The last known provider status is kept, not overwritten with a guess.
    expect((await campaigns.loadCampaign(db, c.id))!.platforms[0].platform.status).toBe("active");
  });

  it("handles missing metrics and auto-pauses at the authorised spend cap", async () => {
    const db = getDb();
    const t = await makeTenant("Solo");
    const accounts = await goLive(t, ["meta"]);
    const c = await readyCampaign(t, { providers: ["meta"] });
    await campaigns.setPlatforms(db, t.actor, c.id, { providers: ["meta"], metaAccountId: accounts.meta });
    await approveCampaign(t, c.id);
    metaHappyPath(mock, "ACTIVE");
    await publishing.requestPublish(db, t.actor, c.id);
    await runAllHandlers(db);
    const p = (await campaigns.loadCampaign(db, c.id))!.platforms[0].platform;
    mock.on(/\/insights\?/, () => ({ body: { data: [] } }));
    expect(await publishing.syncPlatform(db, p.id)).toMatchObject({ cumulative: 0 });
    expect(await db.select().from(metricSnapshots)).toHaveLength(0);
    // Spend reaches the ₹10,000 authorised maximum.
    mock.on(/\/insights\?/, () => ({ body: { data: [{ date_start: "2026-10-21", spend: "10000.00", impressions: "1", clicks: "1", account_currency: "INR" }] } }));
    let paused = false;
    mock.on(/graph\.facebook\.com\/v\d+\.\d+\/\d+$/, (call) => {
      if (new URLSearchParams(call.body).get("status") === "PAUSED") paused = true;
      return { body: { success: true } };
    }, { method: "POST" });
    mock.on(/\/v\d+\.\d+\/\?ids=/, (call) => {
      const ids = decodeURIComponent(new URL(call.url).searchParams.get("ids") ?? "").split(",");
      return { body: Object.fromEntries(ids.map((id) => [id, { effective_status: paused ? "CAMPAIGN_PAUSED" : "ACTIVE" }])) };
    });
    await publishing.syncPlatform(db, p.id);
    expect(paused).toBe(true);
    const after = await campaigns.loadCampaign(db, c.id);
    expect(after!.platforms[0].platform.status).toBe("paused");
    expect((await db.select().from(notifications).where(eq(notifications.kind, "spend_cap_reached")))).toHaveLength(1);
    // Thresholds notify once only.
    await publishing.syncPlatform(db, p.id);
    expect((await db.select().from(notifications).where(eq(notifications.kind, "spend_threshold")))).toHaveLength(1);
  });

  it("refuses to publish when the campaign changed after publishing was requested", async () => {
    const db = getDb();
    const t = await makeTenant("Solo");
    const c = await readyCampaign(t);
    await approveCampaign(t, c.id);
    await publishing.requestPublish(db, t.actor, c.id);
    await db.update(campaignsTable).set({ maxAuthorisedSpend: 1 }).where(eq(campaignsTable.id, c.id));
    await runAllHandlers(db);
    const p = (await campaigns.loadCampaign(db, c.id))!.platforms[0].platform;
    expect(p.status).toBe("failed");
    expect(p.lastError).toMatch(/no longer matches the approval/);
    expect(p.publishedAt).toBeNull();
  });
});

describe("OAuth state and error classification", () => {
  it("accepts state once, only for the same user and provider, before expiry", async () => {
    const db = getDb();
    const t = await makeTenant("Solo");
    const other = await actorFor((await makeUser()).id);
    await db.insert(oauthStates).values({ stateHash: hashToken("good-state"), organisationId: t.org.id, userId: t.owner.id, provider: "meta", expiresAt: new Date(Date.now() + 60_000) });
    await db.insert(oauthStates).values({ stateHash: hashToken("old-state"), organisationId: t.org.id, userId: t.owner.id, provider: "meta", expiresAt: new Date(Date.now() - 1000) });
    await expect(consumeOAuthState(db, other, "meta", "good-state")).rejects.toThrow(/invalid or has expired/);
    await expect(consumeOAuthState(db, t.actor, "google", "good-state")).rejects.toThrow(/invalid or has expired/);
    await expect(consumeOAuthState(db, t.actor, "meta", "old-state")).rejects.toThrow(/invalid or has expired/);
    await expect(consumeOAuthState(db, t.actor, "meta", "forged")).rejects.toThrow(/invalid or has expired/);
    await expect(consumeOAuthState(db, t.actor, "meta", "good-state")).resolves.toMatchObject({ organisationId: t.org.id });
    await expect(consumeOAuthState(db, t.actor, "meta", "good-state")).rejects.toThrow(/invalid or has expired/);
  });

  it("classifies provider errors for retry decisions", () => {
    expect(classifyMetaError(400, { code: 190, message: "x" }).kind).toBe("auth");
    expect(classifyMetaError(400, { code: 17, message: "x" }).retryable).toBe(true);
    expect(classifyMetaError(400, { code: 80004, message: "x" }).kind).toBe("rate_limit");
    expect(classifyMetaError(400, { code: 200, message: "x" }).kind).toBe("permission");
    expect(classifyMetaError(500, { code: 2, message: "x" }).retryable).toBe(true);
    expect(classifyMetaError(400, { code: 100, message: "x" }).retryable).toBe(false);
    expect(classifyGoogleError(429, { error: { status: "RESOURCE_EXHAUSTED" } }).kind).toBe("rate_limit");
    expect(classifyGoogleError(401, { error: { status: "UNAUTHENTICATED" } }).kind).toBe("auth");
    expect(classifyGoogleError(503, { error: { status: "UNAVAILABLE" } }).retryable).toBe(true);
    expect(classifyGoogleError(400, { error: { status: "INVALID_ARGUMENT" } }).kind).toBe("validation");
  });
});

