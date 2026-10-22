/**
 * Provider adapter contract. Provider-specific structures (Meta ad sets,
 * Google ad groups, resource names) stay inside the adapters; the rest of the
 * application deals only with these neutral types.
 */

export type Provider = "meta" | "google";
export type PlatformStatus = "pending_review" | "active" | "paused" | "rejected" | "failed" | "completed" | "demo";

export interface LocationBudgetSpec {
  locationId: string;
  locationName: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  includePincodes: string[];
  excludePincodes: string[];
  lifetimeBudget: number; // paise
  dailyBudget: number | null; // paise
}

export interface PublishSpec {
  campaignId: string;
  name: string;
  objective: string;
  providerCampaignType: string;
  startDate: string; // YYYY-MM-DD, India time
  endDate: string;
  locations: LocationBudgetSpec[];
  ageMin: number;
  ageMax: number;
  languages: string[];
  placements: "automatic" | "facebook_only" | "instagram_only";
  keywords: string[];
  creative: {
    headline: string;
    primaryText: string;
    description: string;
    headlines: string[];
    descriptions: string[];
    callToAction: string;
    landingUrl: string;
    metaLeadFormId: string | null;
    images: { id: string; bytes: () => Promise<Buffer>; filename: string }[];
  };
  account: { externalId: string; metaPageId: string | null; managerCustomerId: string | null; currency: string | null };
  currency: "INR";
}

export interface StatusResult {
  status: PlatformStatus;
  raw: string;
  detail?: string | null;
}

export interface DailyMetric {
  date: string; // YYYY-MM-DD
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  spend: number | null; // paise
  conversions: number | null;
}

export interface MetricsResult {
  rows: DailyMetric[];
  attributionNote: string;
}

/** External ids created on the provider. Persisted after every step so a retry never duplicates objects. */
export type Refs = Record<string, string>;

export interface PublishContext {
  persistRefs(refs: Refs): Promise<void>;
}

export interface AdsAdapter {
  provider: Provider;
  mode: "demo" | "live";
  publish(spec: PublishSpec, refs: Refs, ctx: PublishContext): Promise<StatusResult>;
  fetchStatus(refs: Refs): Promise<StatusResult>;
  fetchMetrics(refs: Refs, since: string, until: string): Promise<MetricsResult>;
  setPaused(refs: Refs, paused: boolean): Promise<StatusResult>;
}

export type ProviderErrorKind = "auth" | "permission" | "rate_limit" | "validation" | "transient" | "not_configured" | "unknown";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: ProviderErrorKind,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ProviderError";
  }

  get retryable(): boolean {
    return this.kind === "rate_limit" || this.kind === "transient";
  }
}

/** Minimal fetch signature so tests can inject a mock provider API. */
export type FetchFn = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string | URLSearchParams | FormData }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;
