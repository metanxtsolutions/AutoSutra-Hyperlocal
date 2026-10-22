/**
 * Meta Marketing API adapter (Graph API).
 *
 * Verification status: written against the documented Marketing API and
 * exercised with a mocked Graph API in tests/providers.test.ts. It has NOT
 * been run against a real ad account, because that needs a Meta app with
 * ads_management Advanced Access (see docs/PROVIDER_SETUP.md). Keep
 * ADS_META_MODE=demo until a test ad account has been exercised end to end.
 *
 * Structure created per AutoSutra campaign:
 *   1 campaign  →  1 ad set per targeted location (own budget and radius)
 *              →  1 creative shared by all ads  →  1 ad per ad set
 * Every id is persisted as soon as Meta returns it, so a retry after a timeout
 * resumes instead of creating duplicates.
 */
import { META_CTA } from "@/lib/objectives";
import { decimalStringToPaise } from "@/lib/money";
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

const GRAPH = "https://graph.facebook.com";

const OPTIMISATION: Record<string, { goal: string; billing: string; destination?: string }> = {
  OUTCOME_TRAFFIC: { goal: "LINK_CLICKS", billing: "IMPRESSIONS", destination: "WEBSITE" },
  OUTCOME_AWARENESS: { goal: "REACH", billing: "IMPRESSIONS" },
  OUTCOME_LEADS: { goal: "LEAD_GENERATION", billing: "IMPRESSIONS", destination: "ON_AD" },
};

/** Ad effective_status → AutoSutra platform status. Unknown values are treated as failures, never as active. */
const EFFECTIVE_STATUS: Record<string, PlatformStatus> = {
  ACTIVE: "active",
  PAUSED: "paused",
  CAMPAIGN_PAUSED: "paused",
  ADSET_PAUSED: "paused",
  PENDING_REVIEW: "pending_review",
  IN_PROCESS: "pending_review",
  PREAPPROVED: "pending_review",
  DISAPPROVED: "rejected",
  WITH_ISSUES: "failed",
  PENDING_BILLING_INFO: "failed",
  ARCHIVED: "completed",
  DELETED: "completed",
};

/** Precedence when ads in one campaign disagree. */
const PRECEDENCE: PlatformStatus[] = ["failed", "rejected", "pending_review", "active", "paused", "completed"];

export function classifyMetaError(status: number, err: Record<string, unknown> | undefined): ProviderError {
  const code = Number(err?.code ?? 0);
  const sub = err?.error_subcode;
  const msg = String(err?.error_user_msg ?? err?.message ?? `HTTP ${status}`);
  const details = { code, subcode: sub, fbtrace_id: err?.fbtrace_id };
  if (code === 190 || status === 401) return new ProviderError(`Meta access token is invalid or expired: ${msg}`, "auth", details);
  if ([4, 17, 32, 341, 613].includes(code) || (code >= 80000 && code <= 80014) || status === 429) return new ProviderError(`Meta rate limit reached: ${msg}`, "rate_limit", details);
  if (code === 10 || (code >= 200 && code <= 299) || status === 403) return new ProviderError(`Meta permission denied: ${msg}`, "permission", details);
  if (code === 1 || code === 2 || status >= 500) return new ProviderError(`Meta service error: ${msg}`, "transient", details);
  if (code === 100 || status === 400) return new ProviderError(`Meta rejected the request: ${msg}`, "validation", details);
  return new ProviderError(`Meta API error: ${msg}`, "unknown", details);
}

export class MetaClient {
  constructor(
    private token: string,
    private version: string,
    private fetchFn: FetchFn,
  ) {}

  async call(method: "GET" | "POST" | "DELETE", path: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const encoded = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      encoded.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    let url = `${GRAPH}/${this.version}/${path}`;
    const headers = { Authorization: `Bearer ${this.token}` };
    let res;
    if (method === "GET") {
      url += `?${encoded}`;
      res = await guardedFetch(this.fetchFn, url, { method, headers });
    } else {
      res = await guardedFetch(this.fetchFn, url, { method, headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" }, body: encoded.toString() });
    }
    const body = await readJson(res);
    if (res.status >= 400 || body.error) throw classifyMetaError(res.status, body.error as Record<string, unknown> | undefined);
    return body;
  }
}

export class MetaAdapter implements AdsAdapter {
  readonly provider = "meta" as const;
  readonly mode = "live" as const;
  private client: MetaClient;

  constructor(
    accessToken: string,
    version: string,
    private initialStatus: "PAUSED" | "ACTIVE",
    fetchFn: FetchFn,
  ) {
    this.client = new MetaClient(accessToken, version, fetchFn);
  }

  private act(spec: PublishSpec) {
    const id = spec.account.externalId;
    return id.startsWith("act_") ? id : `act_${id}`;
  }

  async publish(spec: PublishSpec, refs: Refs, ctx: PublishContext): Promise<StatusResult> {
    const opt = OPTIMISATION[spec.providerCampaignType];
    if (!opt) throw new ProviderError(`Meta campaign type ${spec.providerCampaignType} is not supported`, "validation");
    if (!spec.account.metaPageId) throw new ProviderError("A Facebook Page is required to publish Meta ads", "validation");
    if (spec.providerCampaignType === "OUTCOME_LEADS" && !spec.creative.metaLeadFormId) throw new ProviderError("Instant-form campaigns need a lead form id", "validation");
    const act = this.act(spec);
    const name = `AutoSutra ${spec.name}`.slice(0, 250);
    const save = () => ctx.persistRefs(refs);

    if (!refs.campaign_id) {
      const res = await this.client.call("POST", `${act}/campaigns`, {
        name,
        objective: spec.providerCampaignType,
        status: this.initialStatus,
        special_ad_categories: [],
        buying_type: "AUCTION",
        // Budgets live on ad sets (one per location), so campaign budget sharing is off.
        is_adset_budget_sharing_enabled: false,
      });
      refs.campaign_id = String(res.id);
      await save();
    }

    if (!refs.image_hash && spec.creative.images.length) {
      const img = spec.creative.images[0];
      const res = await this.client.call("POST", `${act}/adimages`, { bytes: (await img.bytes()).toString("base64"), name: img.filename });
      const images = res.images as Record<string, { hash: string }> | undefined;
      const first = images && Object.values(images)[0];
      if (!first?.hash) throw new ProviderError("Meta did not return an image hash", "unknown");
      refs.image_hash = first.hash;
      await save();
    }

    if (!refs.creative_id) {
      const ctaType = spec.creative.metaLeadFormId ? "SIGN_UP" : META_CTA[spec.creative.callToAction] ?? "LEARN_MORE";
      const ctaValue = spec.creative.metaLeadFormId ? { lead_gen_form_id: spec.creative.metaLeadFormId } : { link: spec.creative.landingUrl };
      const res = await this.client.call("POST", `${act}/adcreatives`, {
        name: `${name} creative`,
        object_story_spec: {
          page_id: spec.account.metaPageId,
          link_data: {
            link: spec.creative.landingUrl,
            message: spec.creative.primaryText,
            name: spec.creative.headline,
            description: spec.creative.description || undefined,
            image_hash: refs.image_hash,
            call_to_action: { type: ctaType, value: ctaValue },
          },
        },
      });
      refs.creative_id = String(res.id);
      await save();
    }

    for (const loc of spec.locations) {
      const adsetKey = `adset:${loc.locationId}`;
      if (!refs[adsetKey]) {
        const targeting: Record<string, unknown> = {
          geo_locations: {
            custom_locations: [{ latitude: loc.latitude, longitude: loc.longitude, radius: loc.radiusKm, distance_unit: "kilometer" }],
            // PIN codes use Meta's zip key format; verify keys with the Targeting Search API before go-live.
            ...(loc.includePincodes.length ? { zips: loc.includePincodes.map((p) => ({ key: `IN:${p}` })) } : {}),
          },
          ...(loc.excludePincodes.length ? { excluded_geo_locations: { zips: loc.excludePincodes.map((p) => ({ key: `IN:${p}` })) } } : {}),
          age_min: spec.ageMin,
          age_max: spec.ageMax,
          targeting_automation: { advantage_audience: 0 },
          ...(spec.placements === "facebook_only" ? { publisher_platforms: ["facebook"] } : {}),
          ...(spec.placements === "instagram_only" ? { publisher_platforms: ["instagram"] } : {}),
        };
        const res = await this.client.call("POST", `${act}/adsets`, {
          name: `${name} ${loc.locationName}`.slice(0, 250),
          campaign_id: refs.campaign_id,
          status: this.initialStatus,
          billing_event: opt.billing,
          optimization_goal: opt.goal,
          bid_strategy: "LOWEST_COST_WITHOUT_CAP",
          destination_type: opt.destination,
          promoted_object: spec.providerCampaignType === "OUTCOME_LEADS" ? { page_id: spec.account.metaPageId } : undefined,
          // INR minor units are paise, which is how AutoSutra stores money.
          ...(loc.dailyBudget ? { daily_budget: loc.dailyBudget } : { lifetime_budget: loc.lifetimeBudget }),
          start_time: `${spec.startDate}T00:00:00+0530`,
          end_time: `${spec.endDate}T23:59:59+0530`,
          targeting,
        });
        refs[adsetKey] = String(res.id);
        await save();
      }
      const adKey = `ad:${loc.locationId}`;
      if (!refs[adKey]) {
        const res = await this.client.call("POST", `${act}/ads`, {
          name: `${name} ${loc.locationName} ad`.slice(0, 250),
          adset_id: refs[adsetKey],
          creative: { creative_id: refs.creative_id },
          status: this.initialStatus,
        });
        refs[adKey] = String(res.id);
        await save();
      }
    }
    return this.fetchStatus(refs);
  }

  async fetchStatus(refs: Refs): Promise<StatusResult> {
    const adIds = Object.entries(refs).filter(([k]) => k.startsWith("ad:")).map(([, v]) => v);
    if (!adIds.length) throw new ProviderError("No Meta ads have been created for this campaign yet", "validation");
    const res = await this.client.call("GET", "", { ids: adIds.join(","), fields: "effective_status,ad_review_feedback" });
    const statuses: { raw: string; feedback?: unknown }[] = adIds.map((id) => {
      const row = res[id] as { effective_status?: string; ad_review_feedback?: unknown } | undefined;
      return { raw: row?.effective_status ?? "UNKNOWN", feedback: row?.ad_review_feedback };
    });
    const mapped = statuses.map((s) => EFFECTIVE_STATUS[s.raw] ?? "failed");
    const status = PRECEDENCE.find((p) => mapped.includes(p)) ?? "failed";
    const feedback = statuses.find((s) => s.feedback)?.feedback;
    return {
      status,
      raw: Array.from(new Set(statuses.map((s) => s.raw))).join(","),
      detail: feedback ? JSON.stringify(feedback).slice(0, 1000) : null,
    };
  }

  async fetchMetrics(refs: Refs, since: string, until: string): Promise<MetricsResult> {
    if (!refs.campaign_id) return { rows: [], attributionNote: "" };
    const rows: DailyMetric[] = [];
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const res = await this.client.call("GET", `${refs.campaign_id}/insights`, {
        fields: "spend,impressions,reach,clicks,actions,account_currency",
        time_increment: 1,
        time_range: { since, until },
        limit: 100,
        after,
      });
      for (const r of (res.data as Record<string, unknown>[] | undefined) ?? []) {
        if (r.account_currency && r.account_currency !== "INR") throw new ProviderError(`Meta reported spend in ${String(r.account_currency)}; only INR accounts are supported`, "validation");
        const actions = (r.actions as { action_type: string; value: string }[] | undefined) ?? [];
        const leads = actions.filter((a) => a.action_type === "lead").reduce((s, a) => s + Number(a.value), 0);
        rows.push({
          date: String(r.date_start),
          impressions: r.impressions !== undefined ? Number(r.impressions) : null,
          reach: r.reach !== undefined ? Number(r.reach) : null,
          clicks: r.clicks !== undefined ? Number(r.clicks) : null,
          spend: r.spend !== undefined ? decimalStringToPaise(String(r.spend)) : null,
          conversions: actions.length ? leads : null,
        });
      }
      after = ((res.paging as { cursors?: { after?: string }; next?: string } | undefined)?.next && (res.paging as { cursors?: { after?: string } }).cursors?.after) || undefined;
      if (!after) break;
    }
    return { rows, attributionNote: "Meta-reported. Conversions are 'lead' actions under the ad account's attribution setting (Meta default: 7-day click, 1-day view). Daily reach is not additive." };
  }

  async setPaused(refs: Refs, paused: boolean): Promise<StatusResult> {
    if (!refs.campaign_id) throw new ProviderError("Nothing to pause: the Meta campaign was not created", "validation");
    // Pausing the campaign stops delivery; resuming must re-enable every level.
    const ids = paused ? [refs.campaign_id] : [refs.campaign_id, ...Object.entries(refs).filter(([k]) => k.startsWith("adset:") || k.startsWith("ad:")).map(([, v]) => v)];
    for (const id of ids) await this.client.call("POST", id, { status: paused ? "PAUSED" : "ACTIVE" });
    return this.fetchStatus(refs);
  }
}

// ------------------------------------------------------------------ OAuth and account discovery

export const META_SCOPES = ["ads_management", "ads_read", "business_management", "pages_show_list", "pages_read_engagement", "pages_manage_ads", "leads_retrieval"];

export interface MetaLead {
  id: string;
  createdTime: string;
  fields: Record<string, string>;
}

/** Instant-form leads created after `sinceUnix` (needs leads_retrieval and a Page access the user can manage). */
export async function metaFetchLeads(client: MetaClient, formId: string, sinceUnix: number): Promise<MetaLead[]> {
  const out: MetaLead[] = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res = await client.call("GET", `${formId}/leads`, {
      fields: "id,created_time,field_data",
      filtering: [{ field: "time_created", operator: "GREATER_THAN", value: sinceUnix }],
      limit: 100,
      after,
    });
    for (const l of (res.data as { id: string; created_time: string; field_data?: { name: string; values: string[] }[] }[] | undefined) ?? []) {
      out.push({ id: String(l.id), createdTime: l.created_time, fields: Object.fromEntries((l.field_data ?? []).map((f) => [f.name, f.values?.[0] ?? ""])) });
    }
    const paging = res.paging as { next?: string; cursors?: { after?: string } } | undefined;
    after = paging?.next ? paging.cursors?.after : undefined;
    if (!after) break;
  }
  return out;
}

export function metaAuthUrl(opts: { appId: string; redirectUri: string; state: string; version: string }): string {
  const q = new URLSearchParams({ client_id: opts.appId, redirect_uri: opts.redirectUri, state: opts.state, scope: META_SCOPES.join(","), response_type: "code" });
  return `https://www.facebook.com/${opts.version}/dialog/oauth?${q}`;
}

export async function metaExchangeCode(opts: { appId: string; appSecret: string; redirectUri: string; code: string; version: string; fetchFn: FetchFn }) {
  const short = await guardedFetch(
    opts.fetchFn,
    `${GRAPH}/${opts.version}/oauth/access_token?${new URLSearchParams({ client_id: opts.appId, client_secret: opts.appSecret, redirect_uri: opts.redirectUri, code: opts.code })}`,
  );
  const sBody = await readJson(short);
  if (short.status >= 400 || sBody.error) throw classifyMetaError(short.status, sBody.error as Record<string, unknown>);
  // Exchange for a long-lived token (about 60 days).
  const long = await guardedFetch(
    opts.fetchFn,
    `${GRAPH}/${opts.version}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: opts.appId, client_secret: opts.appSecret, fb_exchange_token: String(sBody.access_token) })}`,
  );
  const lBody = await readJson(long);
  if (long.status >= 400 || lBody.error) throw classifyMetaError(long.status, lBody.error as Record<string, unknown>);
  return {
    accessToken: String(lBody.access_token),
    expiresAt: lBody.expires_in ? new Date(Date.now() + Number(lBody.expires_in) * 1000) : null,
  };
}

export async function metaDiscover(client: MetaClient) {
  const me = await client.call("GET", "me", { fields: "id,name" });
  const perms = await client.call("GET", "me/permissions");
  const granted = ((perms.data as { permission: string; status: string }[]) ?? []).filter((p) => p.status === "granted").map((p) => p.permission);
  const accounts = await client.call("GET", "me/adaccounts", { fields: "id,account_id,name,currency,timezone_name,account_status", limit: 200 });
  const pages = await client.call("GET", "me/accounts", { fields: "id,name", limit: 200 });
  return {
    userId: String(me.id),
    userName: String(me.name ?? ""),
    granted,
    missing: META_SCOPES.filter((s) => !granted.includes(s)),
    adAccounts: ((accounts.data as Record<string, unknown>[]) ?? []).map((a) => ({
      externalId: String(a.id),
      name: String(a.name ?? a.id),
      currency: a.currency ? String(a.currency) : null,
      timezone: a.timezone_name ? String(a.timezone_name) : null,
      status: String(a.account_status ?? ""),
    })),
    pages: ((pages.data as Record<string, unknown>[]) ?? []).map((p) => ({ id: String(p.id), name: String(p.name ?? p.id) })),
  };
}
