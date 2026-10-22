/**
 * Automotive objectives and how each maps to campaign types the providers
 * actually support in AutoSutra's adapters. Client-safe.
 *
 * Mapping principles
 * - Meta: traffic to a landing page (OUTCOME_TRAFFIC), awareness/reach
 *   (OUTCOME_AWARENESS), or instant-form leads (OUTCOME_LEADS) when a Meta lead
 *   form id is supplied.
 * - Google: Search campaigns with proximity targeting and keywords. Google
 *   Display, Video, Performance Max, call and lead-form assets are not
 *   implemented yet and are reported as unsupported rather than approximated.
 */

export type Provider = "meta" | "google";

export type ObjectiveValue =
  | "new_vehicle_launch"
  | "test_drive_enquiries"
  | "new_car_promotion"
  | "new_two_wheeler_promotion"
  | "pre_owned_enquiries"
  | "ev_promotion"
  | "exchange_offer"
  | "finance_emi_promotion"
  | "service_camp"
  | "periodic_maintenance"
  | "accessories"
  | "dealership_event"
  | "open_house"
  | "local_brand_awareness"
  | "website_traffic"
  | "phone_calls"
  | "whatsapp_enquiries";

export interface ProviderMapping {
  supported: boolean;
  /** Provider campaign type used by the adapter. */
  campaignType?: string;
  /** Alternative campaign type when an instant lead form is configured (Meta only). */
  leadFormCampaignType?: string;
  formats: string[];
  requires: ("landing_url" | "keywords" | "meta_page")[];
  note: string;
}

export interface ObjectiveDef {
  value: ObjectiveValue;
  label: string;
  group: "Sales" | "Service" | "Brand and events" | "Response";
  description: string;
  /** Promotional claims typical of this objective that need approval before publishing. */
  claimSensitive: boolean;
  templateCategory: string;
  meta: ProviderMapping;
  google: ProviderMapping;
}

const metaTraffic = (note = "Link ad to your landing or booking page; optimises for link clicks."): ProviderMapping => ({
  supported: true,
  campaignType: "OUTCOME_TRAFFIC",
  leadFormCampaignType: "OUTCOME_LEADS",
  formats: ["Single image or video link ad", "Instant form (when a lead form id is set)"],
  requires: ["landing_url", "meta_page"],
  note,
});
const metaAwareness = (note = "Reach people around the location; optimises for reach."): ProviderMapping => ({
  supported: true,
  campaignType: "OUTCOME_AWARENESS",
  formats: ["Single image or video ad"],
  requires: ["landing_url", "meta_page"],
  note,
});
const googleSearch = (note = "Search ads shown to people searching nearby; needs keywords."): ProviderMapping => ({
  supported: true,
  campaignType: "SEARCH",
  formats: ["Responsive search ad (up to 15 headlines, 4 descriptions)"],
  requires: ["landing_url", "keywords"],
  note,
});
const unsupported = (note: string): ProviderMapping => ({ supported: false, formats: [], requires: [], note });

export const OBJECTIVE_DEFS: ObjectiveDef[] = [
  { value: "new_vehicle_launch", label: "New vehicle launch", group: "Sales", description: "Announce a new model or variant to buyers near your showroom.", claimSensitive: true, templateCategory: "new_launch", meta: metaAwareness(), google: googleSearch("Search ads for people searching the model name nearby.") },
  { value: "test_drive_enquiries", label: "Test-drive enquiries", group: "Sales", description: "Generate test-drive bookings for specific models.", claimSensitive: false, templateCategory: "test_drive", meta: metaTraffic("Traffic to your test-drive booking page, or an instant form if you set a lead form id."), google: googleSearch() },
  { value: "new_car_promotion", label: "New car promotion", group: "Sales", description: "Promote new car models and current offers.", claimSensitive: true, templateCategory: "festive", meta: metaTraffic(), google: googleSearch() },
  { value: "new_two_wheeler_promotion", label: "New two-wheeler promotion", group: "Sales", description: "Promote two-wheeler models and offers.", claimSensitive: true, templateCategory: "festive", meta: metaTraffic(), google: googleSearch() },
  { value: "pre_owned_enquiries", label: "Pre-owned vehicle enquiries", group: "Sales", description: "Enquiries for certified pre-owned stock.", claimSensitive: true, templateCategory: "pre_owned", meta: metaTraffic(), google: googleSearch() },
  { value: "ev_promotion", label: "EV promotion", group: "Sales", description: "Electric vehicle awareness and enquiries.", claimSensitive: true, templateCategory: "ev", meta: metaTraffic(), google: googleSearch() },
  { value: "exchange_offer", label: "Exchange offer", group: "Sales", description: "Encourage owners to exchange their current vehicle.", claimSensitive: true, templateCategory: "exchange", meta: metaTraffic(), google: googleSearch() },
  { value: "finance_emi_promotion", label: "Finance or EMI promotion", group: "Sales", description: "Promote finance schemes. EMI, rate and eligibility claims need approval and a disclaimer.", claimSensitive: true, templateCategory: "festive", meta: metaTraffic("Traffic campaign. Meta may classify finance ads under a special ad category; this is checked at review."), google: googleSearch("Search ads. Google financial services policies apply.") },
  { value: "service_camp", label: "Service camp", group: "Service", description: "Invite owners to a service camp at your workshop.", claimSensitive: true, templateCategory: "service_camp", meta: metaTraffic(), google: googleSearch() },
  { value: "periodic_maintenance", label: "Periodic maintenance", group: "Service", description: "Remind owners nearby about scheduled maintenance.", claimSensitive: false, templateCategory: "service_camp", meta: metaTraffic(), google: googleSearch() },
  { value: "accessories", label: "Accessories", group: "Service", description: "Promote genuine accessories and fitment.", claimSensitive: true, templateCategory: "accessories", meta: metaTraffic(), google: googleSearch() },
  { value: "dealership_event", label: "Dealership event", group: "Brand and events", description: "Drive footfall to an event at your location.", claimSensitive: false, templateCategory: "event", meta: metaAwareness(), google: unsupported("Google Search relies on existing search demand, which events rarely have. Display and video campaigns are not supported yet.") },
  { value: "open_house", label: "Open house", group: "Brand and events", description: "Invite the neighbourhood to an open house.", claimSensitive: false, templateCategory: "event", meta: metaAwareness(), google: unsupported("Not supported on Google yet for the same reason as dealership events.") },
  { value: "local_brand_awareness", label: "Local brand awareness", group: "Brand and events", description: "Build familiarity with your dealership in its catchment.", claimSensitive: false, templateCategory: "event", meta: metaAwareness(), google: unsupported("Google awareness formats (Display, YouTube) are not supported yet.") },
  { value: "website_traffic", label: "Website traffic", group: "Response", description: "Send local visitors to your website.", claimSensitive: false, templateCategory: "test_drive", meta: metaTraffic(), google: googleSearch() },
  { value: "phone_calls", label: "Phone calls", group: "Response", description: "Get calls from nearby buyers.", claimSensitive: false, templateCategory: "test_drive", meta: unsupported("Call ads are not implemented yet. Use website traffic or test-drive enquiries with your phone number on the landing page."), google: unsupported("Call assets and call-only ads are not implemented yet.") },
  { value: "whatsapp_enquiries", label: "WhatsApp enquiries", group: "Response", description: "Start WhatsApp conversations with nearby buyers.", claimSensitive: false, templateCategory: "test_drive", meta: unsupported("Click-to-WhatsApp needs a WhatsApp Business number linked to your Facebook Page and is not implemented yet."), google: unsupported("Not available as a Google Search format in AutoSutra yet.") },
];

export const OBJECTIVES = OBJECTIVE_DEFS.map((o) => ({ value: o.value, label: o.label }));

export function objectiveDef(value: string): ObjectiveDef | undefined {
  return OBJECTIVE_DEFS.find((o) => o.value === value);
}

export function providerMapping(value: string, provider: Provider): ProviderMapping {
  const def = objectiveDef(value);
  if (!def) return unsupported("Unknown objective");
  return def[provider];
}

/** Provider campaign type for a platform, accounting for Meta instant forms. */
export function resolveCampaignType(objective: string, provider: Provider, opts: { metaLeadFormId?: string | null } = {}): string | null {
  const m = providerMapping(objective, provider);
  if (!m.supported) return null;
  if (provider === "meta" && opts.metaLeadFormId && m.leadFormCampaignType) return m.leadFormCampaignType;
  return m.campaignType ?? null;
}

export const CALL_TO_ACTIONS = [
  { value: "LEARN_MORE", label: "Learn more" },
  { value: "BOOK_NOW", label: "Book now" },
  { value: "CONTACT_US", label: "Contact us" },
  { value: "GET_QUOTE", label: "Get quote" },
  { value: "GET_OFFER", label: "Get offer" },
  { value: "SIGN_UP", label: "Sign up" },
] as const;

/** Meta API enum for each CTA (Meta calls "Book now" BOOK_TRAVEL). */
export const META_CTA: Record<string, string> = {
  LEARN_MORE: "LEARN_MORE",
  BOOK_NOW: "BOOK_TRAVEL",
  CONTACT_US: "CONTACT_US",
  GET_QUOTE: "GET_QUOTE",
  GET_OFFER: "GET_OFFER",
  SIGN_UP: "SIGN_UP",
};

/** Creative limits enforced before publishing. */
export const CREATIVE_LIMITS = {
  meta: { headline: 40, primaryText: 500, description: 30 },
  google: { headline: 30, description: 90, minHeadlines: 3, maxHeadlines: 15, minDescriptions: 2, maxDescriptions: 4, keywordMax: 80, maxKeywords: 50 },
} as const;
