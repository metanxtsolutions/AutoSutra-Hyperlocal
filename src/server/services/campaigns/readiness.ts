import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../../db/client";
import { advertisingConnections } from "../../db/schema";
import { CREATIVE_LIMITS, objectiveDef, providerMapping } from "@/lib/objectives";
import { PROVIDER_RADIUS_LIMITS_KM } from "@/lib/geo";
import { checkCopy, hasUnfilledPlaceholder } from "@/lib/policy";
import { formatINR } from "@/lib/money";
import { todayIST } from "@/lib/format";
import { effectiveMode, type EffectiveMode } from "../../providers/modes";
import { totalBudget, type FullCampaign } from "./load";

export interface Finding {
  key: string;
  severity: "blocker" | "warning" | "info";
  section: "location" | "objective" | "product" | "platforms" | "targeting" | "budget" | "creative" | "accounts" | "policy";
  message: string;
}

export interface Readiness {
  findings: Finding[];
  blockers: Finding[];
  warnings: Finding[];
  modes: Record<"meta" | "google", EffectiveMode>;
  ready: boolean;
}

const MAX_DURATION_DAYS = 180;
export const MIN_PLATFORM_LOCATION_BUDGET = 500_00; // ₹500

function days(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Everything that must be true before a campaign can be submitted, approved or published. */
export async function checkReadiness(db: DbOrTx, full: FullCampaign, opts: { today?: string } = {}): Promise<Readiness> {
  const f: Finding[] = [];
  const add = (severity: Finding["severity"], section: Finding["section"], key: string, message: string) => f.push({ key, severity, section, message });
  const c = full.campaign;
  const cr = full.creative;
  const today = opts.today ?? todayIST();
  const def = objectiveDef(c.objective);

  // Location
  if (full.dealership.status !== "active") add("blocker", "location", "dealership_inactive", "The dealership is inactive.");
  if (full.organisation.status !== "active") add("blocker", "location", "org_suspended", "The organisation is suspended.");
  if (!full.targets.length) add("blocker", "targeting", "no_targets", "Choose at least one location to target.");
  for (const { location } of full.targets) {
    if (location.status !== "active") add("blocker", "location", `loc_inactive_${location.id}`, `${location.name} is inactive.`);
    if (location.supportedObjectives.length && !location.supportedObjectives.includes(c.objective)) {
      add("blocker", "location", `loc_objective_${location.id}`, `${location.name} is not configured for "${def?.label ?? c.objective}" campaigns.`);
    }
  }

  // Product and claims
  if (def?.claimSensitive && !c.offerHeadline && !c.model) add("warning", "product", "product_missing", "Add the vehicle model or offer this campaign promotes.");
  if (c.startingPrice && !c.priceVerified) add("blocker", "product", "price_unverified", "Confirm the starting price has been verified, or remove it.");
  if (c.financeDetails && !c.financeApproved) add("blocker", "product", "finance_unapproved", "Finance or EMI details need confirmation that the lender approved them.");
  if ((c.startingPrice || c.financeDetails || c.offerDetails) && !c.disclaimer) add("blocker", "product", "disclaimer_missing", "Add a disclaimer for price, finance or offer claims.");
  if (c.claimsStatus === "pending") add("warning", "product", "claims_pending", "The approver must confirm the promotional claims (price, finance, offers) are accurate and authorised.");
  if (c.claimsStatus === "rejected") add("blocker", "product", "claims_rejected", "Promotional claims were rejected. Edit them and resubmit.");

  // Platforms
  if (!full.platforms.length) add("blocker", "platforms", "no_platforms", "Choose Meta Ads, Google Ads or both.");
  const modes = { meta: await effectiveMode(db, "meta"), google: await effectiveMode(db, "google") };
  for (const { platform: p, account } of full.platforms) {
    const mapping = providerMapping(c.objective, p.provider);
    const name = p.provider === "meta" ? "Meta Ads" : "Google Ads";
    if (!mapping.supported) add("blocker", "platforms", `unsupported_${p.provider}`, `${name} does not support this objective in AutoSutra: ${mapping.note}`);
    const mode = modes[p.provider];
    if (mode === "off") add("blocker", "accounts", `mode_off_${p.provider}`, `Publishing to ${name} is disabled on this platform.`);
    if (mode === "pending") add("blocker", "accounts", `mode_pending_${p.provider}`, `${name} live access is pending approval by AutoSutra. Campaigns cannot be published to ${name} yet.`);
    if (mode === "demo") add("info", "accounts", `mode_demo_${p.provider}`, `${name} is in demo mode: publishing is simulated, nothing is sent to ${name}, and no results will be reported.`);
    if (mode === "live") {
      const conn = await db.query.advertisingConnections.findFirst({
        where: and(eq(advertisingConnections.organisationId, c.organisationId), eq(advertisingConnections.provider, p.provider)),
      });
      if (!conn || conn.status !== "connected") add("blocker", "accounts", `not_connected_${p.provider}`, `Connect your ${name} account before publishing.`);
      if (!account) add("blocker", "accounts", `no_account_${p.provider}`, `Choose which ${name} account to publish to.`);
      if (p.provider === "meta" && account && !account.metaPageId) add("blocker", "accounts", "no_meta_page", "Choose the Facebook Page the ads will run from.");
      if (account?.currency && account.currency !== "INR") add("blocker", "accounts", `currency_${p.provider}`, `The selected ${name} account bills in ${account.currency}; only INR accounts are supported.`);
    }
    // Targeting limits per provider
    for (const { targeting } of full.targets) {
      const lim = PROVIDER_RADIUS_LIMITS_KM[p.provider];
      if (targeting.radiusKm < lim.min || targeting.radiusKm > lim.max) {
        add("blocker", "targeting", `radius_${p.provider}_${targeting.id}`, `${name} radius must be ${lim.min} to ${lim.max} km.`);
      }
      if (p.provider === "google" && targeting.excludePincodes.length) {
        add("warning", "targeting", `google_pin_exclusion_${targeting.id}`, "Google Ads proximity targeting does not exclude PIN codes; exclusions are applied on Meta only.");
      }
    }
    if (p.provider === "google" && mapping.supported && c.keywords.length < 3) add("blocker", "targeting", "google_keywords", "Google Search campaigns need at least 3 keywords.");
    if (p.provider === "meta" && p.providerCampaignType === "OUTCOME_LEADS" && !cr?.metaLeadFormId) {
      add("blocker", "creative", "meta_lead_form", "Instant-form campaigns need a Meta lead form id.");
    }
  }

  // Budget and schedule
  if (!c.startDate || !c.endDate) add("blocker", "budget", "dates", "Set a start and end date.");
  else {
    if (c.startDate < today) add("blocker", "budget", "start_past", "Start date is in the past.");
    if (c.endDate < c.startDate) add("blocker", "budget", "end_before_start", "End date is before the start date.");
    else if (days(c.startDate, c.endDate) > MAX_DURATION_DAYS) add("blocker", "budget", "too_long", `Campaigns can run for at most ${MAX_DURATION_DAYS} days.`);
  }
  const total = totalBudget(full);
  if (total <= 0) add("blocker", "budget", "no_budget", "Allocate a budget to each platform.");
  for (const { platform: p } of full.platforms) {
    const rows = full.budgets.filter((b) => b.campaignPlatformId === p.id);
    if (!rows.length) add("blocker", "budget", `no_budget_${p.provider}`, `Set a ${p.provider === "meta" ? "Meta" : "Google"} budget.`);
    for (const b of rows) {
      if (b.lifetimeBudget < MIN_PLATFORM_LOCATION_BUDGET) add("blocker", "budget", `min_budget_${b.id}`, `Each platform and location needs at least ${formatINR(MIN_PLATFORM_LOCATION_BUDGET, { decimals: false })}.`);
      if (b.dailyBudget && c.startDate && c.endDate && b.dailyBudget * days(c.startDate, c.endDate) < b.lifetimeBudget) {
        add("warning", "budget", `daily_${b.id}`, "The daily budget is too low to spend the lifetime budget within the schedule.");
      }
    }
  }
  if (!c.maxAuthorisedSpend) add("blocker", "budget", "max_spend", "Set the maximum authorised spend.");
  else if (total > c.maxAuthorisedSpend) add("blocker", "budget", "over_max", `Planned budget ${formatINR(total)} exceeds the maximum authorised spend ${formatINR(c.maxAuthorisedSpend)}.`);

  // Creative
  if (!cr) add("blocker", "creative", "no_creative", "Add the ad creative.");
  else {
    const hasMeta = full.platforms.some((p) => p.platform.provider === "meta");
    const hasGoogle = full.platforms.some((p) => p.platform.provider === "google");
    if (!cr.landingUrl) add("blocker", "creative", "landing_url", "Add a landing page URL.");
    else if (!cr.landingUrl.startsWith("https://")) add("blocker", "creative", "landing_https", "Landing page must use https://.");
    if (hasMeta) {
      if (!cr.headline) add("blocker", "creative", "meta_headline", "Add a headline for Meta.");
      else if (cr.headline.length > CREATIVE_LIMITS.meta.headline) add("warning", "creative", "meta_headline_len", `Meta recommends headlines of ${CREATIVE_LIMITS.meta.headline} characters or fewer.`);
      if (!cr.primaryText) add("blocker", "creative", "meta_text", "Add the primary text for Meta.");
      else if (cr.primaryText.length > CREATIVE_LIMITS.meta.primaryText) add("blocker", "creative", "meta_text_len", `Primary text must be ${CREATIVE_LIMITS.meta.primaryText} characters or fewer.`);
      if (!full.assets.length) add("warning", "creative", "meta_no_image", "Meta link ads perform better with an image; without one, Meta uses the landing page preview.");
    }
    if (hasGoogle) {
      const L = CREATIVE_LIMITS.google;
      if (cr.headlines.length < L.minHeadlines) add("blocker", "creative", "google_headlines", `Google responsive search ads need at least ${L.minHeadlines} headlines.`);
      if (cr.headlines.some((h) => h.length > L.headline)) add("blocker", "creative", "google_headline_len", `Google headlines must be ${L.headline} characters or fewer.`);
      if (cr.descriptions.length < L.minDescriptions) add("blocker", "creative", "google_descriptions", `Google responsive search ads need at least ${L.minDescriptions} descriptions.`);
      if (cr.descriptions.some((d) => d.length > L.description)) add("blocker", "creative", "google_description_len", `Google descriptions must be ${L.description} characters or fewer.`);
    }
    if (full.assets.some((a) => !a.licenceConfirmed)) add("blocker", "creative", "licence", "Confirm you have the rights to use every uploaded image or video.");
    const texts = [cr.headline, cr.primaryText, cr.description, ...cr.headlines, ...cr.descriptions, c.offerHeadline, c.offerDetails];
    if (hasUnfilledPlaceholder(...texts)) add("blocker", "creative", "placeholders", "Fill in every template placeholder such as {model}.");
    for (const finding of checkCopy(...texts)) add(finding.severity, "policy", `policy_${finding.message}`, finding.message);
  }

  const blockers = f.filter((x) => x.severity === "blocker");
  return { findings: f, blockers, warnings: f.filter((x) => x.severity === "warning"), modes, ready: blockers.length === 0 };
}
