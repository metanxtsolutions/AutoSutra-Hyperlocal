/**
 * Google Ads API adapter (REST interface).
 *
 * Verification status: written against the documented Google Ads API REST
 * interface and exercised with a mocked API in tests/providers.test.ts. It has
 * NOT been run against a real customer account, because that needs an
 * approved developer token (Basic access or higher). Field names change
 * between API versions: re-check campaign date fields and required fields
 * (e.g. EU political advertising declaration) when changing
 * GOOGLE_ADS_API_VERSION. See docs/PROVIDER_SETUP.md.
 *
 * Structure per targeted location (Google budgets belong to campaigns):
 *   campaign budget → Search campaign (proximity criterion) → ad group
 *   → phrase-match keywords → responsive search ad
 */
import { microsToPaise, paiseToMicros } from "@/lib/money";
import { guardedFetch, readJson } from "./http";
import {
  ProviderError,
  type AdsAdapter,
  type DailyMetric,
  type FetchFn,
  type MetricsResult,
  type PlatformStatus,
  type PublishContext,
  type PublishSpec,
  type Refs,
  type StatusResult,
} from "./types";

const API = "https://googleads.googleapis.com";

export interface GoogleConfig {
  version: string;
  developerToken: string;
  loginCustomerId?: string | null;
  initialStatus: "PAUSED" | "ENABLED";
}

export function classifyGoogleError(status: number, body: Record<string, unknown>): ProviderError {
  const err = (body.error ?? {}) as { message?: string; status?: string; details?: { errors?: { message?: string; errorCode?: Record<string, string> }[] }[] };
  const inner = err.details?.flatMap((d) => d.errors ?? []) ?? [];
  const msg = inner.map((e) => e.message).filter(Boolean).join("; ") || err.message || `HTTP ${status}`;
  const codes = inner.flatMap((e) => Object.values(e.errorCode ?? {}));
  const details = { status: err.status, codes };
  if (status === 401 || err.status === "UNAUTHENTICATED") return new ProviderError(`Google Ads authentication failed: ${msg}`, "auth", details);
  if (status === 429 || err.status === "RESOURCE_EXHAUSTED" || codes.includes("RESOURCE_TEMPORARILY_EXHAUSTED")) return new ProviderError(`Google Ads rate limit reached: ${msg}`, "rate_limit", details);
  if (status === 403 || err.status === "PERMISSION_DENIED" || codes.some((c) => c.includes("DEVELOPER_TOKEN") || c === "USER_PERMISSION_DENIED")) {
    return new ProviderError(`Google Ads permission denied: ${msg}`, "permission", details);
  }
  if (status >= 500 || err.status === "UNAVAILABLE" || err.status === "INTERNAL") return new ProviderError(`Google Ads service error: ${msg}`, "transient", details);
  if (status === 400) return new ProviderError(`Google Ads rejected the request: ${msg}`, "validation", details);
  return new ProviderError(`Google Ads API error: ${msg}`, "unknown", details);
}

export class GoogleAdsClient {
  constructor(
    private cfg: GoogleConfig,
    private getAccessToken: () => Promise<string>,
    private fetchFn: FetchFn,
  ) {}

  private async headers(loginCustomerId?: string | null): Promise<Record<string, string>> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${await this.getAccessToken()}`,
      "developer-token": this.cfg.developerToken,
      "Content-Type": "application/json",
    };
    const login = loginCustomerId ?? this.cfg.loginCustomerId;
    if (login) h["login-customer-id"] = login.replace(/-/g, "");
    return h;
  }

  async request(method: "GET" | "POST", path: string, body?: unknown, loginCustomerId?: string | null): Promise<Record<string, unknown>> {
    const res = await guardedFetch(this.fetchFn, `${API}/${this.cfg.version}/${path}`, {
      method,
      headers: await this.headers(loginCustomerId),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await readJson(res);
    if (res.status >= 400) throw classifyGoogleError(res.status, json);
    return json;
  }

  async mutate(customerId: string, resource: string, operations: unknown[], login?: string | null): Promise<string[]> {
    const res = await this.request("POST", `customers/${customerId}/${resource}:mutate`, { operations }, login);
    return ((res.results as { resourceName: string }[]) ?? []).map((r) => r.resourceName);
  }

  async search(customerId: string, query: string, login?: string | null): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    let pageToken: string | undefined;
    for (let i = 0; i < 50; i++) {
      const res = await this.request("POST", `customers/${customerId}/googleAds:search`, { query, pageToken }, login);
      out.push(...(((res.results as Record<string, unknown>[]) ?? [])));
      pageToken = res.nextPageToken as string | undefined;
      if (!pageToken) break;
    }
    return out;
  }
}

function days(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

export class GoogleAdsAdapter implements AdsAdapter {
  readonly provider = "google" as const;
  readonly mode = "live" as const;
  private client: GoogleAdsClient;

  constructor(
    private cfg: GoogleConfig,
    getAccessToken: () => Promise<string>,
    fetchFn: FetchFn,
  ) {
    this.client = new GoogleAdsClient(cfg, getAccessToken, fetchFn);
  }

  async publish(spec: PublishSpec, refs: Refs, ctx: PublishContext): Promise<StatusResult> {
    if (spec.providerCampaignType !== "SEARCH") throw new ProviderError(`Google campaign type ${spec.providerCampaignType} is not supported`, "validation");
    if (spec.keywords.length < 3) throw new ProviderError("Google Search campaigns need at least 3 keywords", "validation");
    const cid = spec.account.externalId.replace(/-/g, "");
    const login = spec.account.managerCustomerId;
    refs.customer_id = cid;
    const save = () => ctx.persistRefs(refs);
    const duration = days(spec.startDate, spec.endDate);

    for (const loc of spec.locations) {
      const L = loc.locationId;
      const name = `AutoSutra ${spec.name} ${loc.locationName} ${spec.campaignId.slice(0, 8)}`.slice(0, 250);
      if (!refs[`budget:${L}`]) {
        // Google Search budgets are average daily amounts; spread the lifetime budget evenly.
        const daily = loc.dailyBudget ?? Math.max(Math.floor(loc.lifetimeBudget / duration), 100);
        const [rn] = await this.client.mutate(cid, "campaignBudgets", [
          { create: { name: `${name} budget`, amountMicros: String(paiseToMicros(daily)), deliveryMethod: "STANDARD", explicitlyShared: false } },
        ], login);
        refs[`budget:${L}`] = rn;
        await save();
      }
      if (!refs[`campaign:${L}`]) {
        const [rn] = await this.client.mutate(cid, "campaigns", [
          {
            create: {
              name,
              status: this.cfg.initialStatus,
              advertisingChannelType: "SEARCH",
              campaignBudget: refs[`budget:${L}`],
              targetSpend: {},
              networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, targetPartnerSearchNetwork: false },
              startDate: spec.startDate,
              endDate: spec.endDate,
              containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
            },
          },
        ], login);
        refs[`campaign:${L}`] = rn;
        await save();
      }
      if (!refs[`proximity:${L}`]) {
        const [rn] = await this.client.mutate(cid, "campaignCriteria", [
          {
            create: {
              campaign: refs[`campaign:${L}`],
              proximity: {
                geoPoint: { latitudeInMicroDegrees: Math.round(loc.latitude * 1e6), longitudeInMicroDegrees: Math.round(loc.longitude * 1e6) },
                radius: loc.radiusKm,
                radiusUnits: "KILOMETERS",
              },
            },
          },
        ], login);
        refs[`proximity:${L}`] = rn;
        await save();
      }
      if (!refs[`adgroup:${L}`]) {
        const [rn] = await this.client.mutate(cid, "adGroups", [
          { create: { name: `${name} ad group`, campaign: refs[`campaign:${L}`], status: "ENABLED", type: "SEARCH_STANDARD" } },
        ], login);
        refs[`adgroup:${L}`] = rn;
        await save();
      }
      if (!refs[`keywords:${L}`]) {
        await this.client.mutate(
          cid,
          "adGroupCriteria",
          spec.keywords.map((text) => ({ create: { adGroup: refs[`adgroup:${L}`], status: "ENABLED", keyword: { text, matchType: "PHRASE" } } })),
          login,
        );
        refs[`keywords:${L}`] = String(spec.keywords.length);
        await save();
      }
      if (!refs[`ad:${L}`]) {
        const [rn] = await this.client.mutate(cid, "adGroupAds", [
          {
            create: {
              adGroup: refs[`adgroup:${L}`],
              status: "ENABLED",
              ad: {
                finalUrls: [spec.creative.landingUrl],
                responsiveSearchAd: {
                  headlines: spec.creative.headlines.slice(0, 15).map((text) => ({ text })),
                  descriptions: spec.creative.descriptions.slice(0, 4).map((text) => ({ text })),
                },
              },
            },
          },
        ], login);
        refs[`ad:${L}`] = rn;
        await save();
      }
    }
    return this.fetchStatus(refs);
  }

  private campaigns(refs: Refs) {
    return Object.entries(refs).filter(([k]) => k.startsWith("campaign:")).map(([, v]) => v);
  }

  async fetchStatus(refs: Refs): Promise<StatusResult> {
    const camps = this.campaigns(refs);
    if (!camps.length || !refs.customer_id) throw new ProviderError("No Google Ads campaigns have been created for this campaign yet", "validation");
    const list = camps.map((c) => `'${c}'`).join(",");
    const rows = await this.client.search(refs.customer_id, `SELECT campaign.resource_name, campaign.status, campaign.serving_status, campaign.primary_status FROM campaign WHERE campaign.resource_name IN (${list})`);
    const ads = await this.client.search(
      refs.customer_id,
      `SELECT ad_group_ad.resource_name, ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status, campaign.resource_name FROM ad_group_ad WHERE campaign.resource_name IN (${list})`,
    );
    const statuses: PlatformStatus[] = [];
    const raws: string[] = [];
    for (const c of camps) {
      const row = rows.find((r) => (r.campaign as { resourceName?: string })?.resourceName === c)?.campaign as { status?: string; servingStatus?: string; primaryStatus?: string } | undefined;
      const ad = ads.find((a) => (a.campaign as { resourceName?: string })?.resourceName === c)?.adGroupAd as { policySummary?: { approvalStatus?: string; reviewStatus?: string } } | undefined;
      const approval = ad?.policySummary?.approvalStatus;
      const review = ad?.policySummary?.reviewStatus;
      raws.push([row?.status, row?.servingStatus, approval, review].filter(Boolean).join("/"));
      if (!row) statuses.push("failed");
      else if (row.status === "REMOVED" || row.servingStatus === "ENDED") statuses.push("completed");
      else if (approval === "DISAPPROVED") statuses.push("rejected");
      else if (row.status === "PAUSED") statuses.push("paused");
      else if (review === "REVIEW_IN_PROGRESS" || approval === "UNKNOWN" || !approval) statuses.push("pending_review");
      else if (row.status === "ENABLED" && row.servingStatus === "SERVING" && (approval === "APPROVED" || approval === "APPROVED_LIMITED")) statuses.push("active");
      else if (row.servingStatus === "PENDING") statuses.push("pending_review");
      else statuses.push("failed");
    }
    const order: PlatformStatus[] = ["failed", "rejected", "pending_review", "active", "paused", "completed"];
    return { status: order.find((s) => statuses.includes(s)) ?? "failed", raw: raws.join(",").slice(0, 250) };
  }

  async fetchMetrics(refs: Refs, since: string, until: string): Promise<MetricsResult> {
    const camps = this.campaigns(refs);
    if (!camps.length || !refs.customer_id) return { rows: [], attributionNote: "" };
    const rows = await this.client.search(
      refs.customer_id,
      `SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE campaign.resource_name IN (${camps.map((c) => `'${c}'`).join(",")}) AND segments.date BETWEEN '${since}' AND '${until}'`,
    );
    const byDate = new Map<string, DailyMetric>();
    for (const r of rows) {
      const date = String((r.segments as { date?: string })?.date);
      const m = (r.metrics ?? {}) as { impressions?: string; clicks?: string; costMicros?: string; conversions?: number };
      const cur = byDate.get(date) ?? { date, impressions: 0, reach: null, clicks: 0, spend: 0, conversions: 0 };
      cur.impressions = (cur.impressions ?? 0) + Number(m.impressions ?? 0);
      cur.clicks = (cur.clicks ?? 0) + Number(m.clicks ?? 0);
      cur.spend = (cur.spend ?? 0) + microsToPaise(m.costMicros ?? 0);
      cur.conversions = (cur.conversions ?? 0) + Number(m.conversions ?? 0);
      byDate.set(date, cur);
    }
    return { rows: [...byDate.values()], attributionNote: "Google Ads-reported. Conversions use the account's conversion actions and attribution model; reach is not available for Search." };
  }

  async setPaused(refs: Refs, paused: boolean): Promise<StatusResult> {
    const camps = this.campaigns(refs);
    if (!camps.length || !refs.customer_id) throw new ProviderError("Nothing to pause: no Google Ads campaign was created", "validation");
    await this.client.mutate(
      refs.customer_id,
      "campaigns",
      camps.map((resourceName) => ({ update: { resourceName, status: paused ? "PAUSED" : "ENABLED" }, updateMask: "status" })),
    );
    return this.fetchStatus(refs);
  }
}

// ------------------------------------------------------------------ OAuth and account discovery

export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/adwords";

export function googleAuthUrl(opts: { clientId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: opts.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenRequest(fetchFn: FetchFn, params: Record<string, string>) {
  const res = await guardedFetch(fetchFn, "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const body = await readJson(res);
  if (res.status >= 400) {
    const code = String(body.error ?? "");
    if (code === "invalid_grant") throw new ProviderError("Google authorisation has expired or was revoked. Reconnect Google Ads.", "auth", { error: code });
    throw new ProviderError(`Google token request failed: ${String(body.error_description ?? code)}`, res.status >= 500 ? "transient" : "auth", { error: code });
  }
  return body;
}

export async function googleExchangeCode(opts: { clientId: string; clientSecret: string; redirectUri: string; code: string; fetchFn: FetchFn }) {
  const body = await tokenRequest(opts.fetchFn, {
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code",
  });
  if (!body.refresh_token) throw new ProviderError("Google did not return a refresh token. Remove AutoSutra from your Google account permissions and connect again.", "auth");
  return {
    accessToken: String(body.access_token),
    refreshToken: String(body.refresh_token),
    expiresAt: new Date(Date.now() + Number(body.expires_in ?? 3600) * 1000),
    scopes: String(body.scope ?? "").split(" ").filter(Boolean),
  };
}

export async function googleRefresh(opts: { clientId: string; clientSecret: string; refreshToken: string; fetchFn: FetchFn }) {
  const body = await tokenRequest(opts.fetchFn, { client_id: opts.clientId, client_secret: opts.clientSecret, refresh_token: opts.refreshToken, grant_type: "refresh_token" });
  return { accessToken: String(body.access_token), expiresAt: new Date(Date.now() + Number(body.expires_in ?? 3600) * 1000) };
}

export async function googleRevoke(token: string, fetchFn: FetchFn) {
  await guardedFetch(fetchFn, `https://oauth2.googleapis.com/revoke?${new URLSearchParams({ token })}`, { method: "POST" });
}

export async function googleDiscover(client: GoogleAdsClient) {
  const res = await client.request("GET", "customers:listAccessibleCustomers");
  const ids = ((res.resourceNames as string[]) ?? []).map((r) => r.split("/")[1]);
  const accounts = [];
  for (const id of ids.slice(0, 50)) {
    try {
      const [row] = await client.search(id, "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.status FROM customer LIMIT 1", id);
      const c = (row?.customer ?? {}) as { id?: string; descriptiveName?: string; currencyCode?: string; timeZone?: string; manager?: boolean; status?: string };
      accounts.push({ externalId: id, name: c.descriptiveName || id, currency: c.currencyCode ?? null, timezone: c.timeZone ?? null, status: c.status ?? "", manager: !!c.manager });
    } catch (e) {
      if (e instanceof ProviderError && (e.kind === "permission" || e.kind === "validation")) {
        accounts.push({ externalId: id, name: id, currency: null, timezone: null, status: "NO_ACCESS", manager: false });
        continue;
      }
      throw e;
    }
  }
  return accounts;
}
