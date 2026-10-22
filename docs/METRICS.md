# Metric definitions

Rules that apply to every report:

- **Only live, provider-reported data** is used. Demo publications contribute nothing.
- **Meta and Google are shown separately.** They count clicks and conversions differently and use different attribution, so their conversions are never added together.
- Totals across providers are shown only for additive measures (spend, impressions, clicks) and are labelled as totals.
- Every figure shows where it came from (provider or AutoSutra records) and when it was last synced. Provider data older than 6 hours triggers a freshness warning.
- Money is in rupees, computed from integer paise; provider amounts (Meta as a decimal rupee amount, Google in micros) are converted to paise on import. Only INR ad accounts are supported; other currencies are rejected during sync.
- Days are calendar days in India Standard Time.

## Provider metrics (per provider)

| Metric | Definition | Source |
|---|---|---|
| Impressions | Times ads were shown | Meta insights `impressions`; Google `metrics.impressions` |
| Reach | Unique people reached, **per day only** | Meta `reach`. Not additive across days or providers, so no total reach is shown. Google Search does not report reach. |
| Clicks | Meta: all clicks (`clicks`); Google: `metrics.clicks` | Definitions differ: Meta's figure includes clicks on the ad that do not leave the platform |
| CTR | Clicks / impressions, per provider | Calculated |
| Spend | Amount the provider reports as spent | Meta `spend`; Google `metrics.cost_micros` |
| Platform conversions | Conversions as counted by the provider | Meta: `lead` actions under the ad account's attribution setting (Meta default 7-day click, 1-day view). Google: the account's conversion actions and attribution model. |

## AutoSutra lead metrics

| Metric | Definition |
|---|---|
| Leads captured | Leads recorded in AutoSutra in the period (forms, Meta lead sync, manual, import), excluding duplicates and leads marked Invalid |
| Attributed leads (per provider) | Leads whose campaign platform is on that provider; leads without a campaign are counted only in totals |
| Qualified | Leads whose current status is Qualified or any later stage (test drive scheduled or completed, booking, sold) |
| Test drives | Leads whose current status is Test drive completed, Booking or Sold |
| Bookings, Sales | Leads at Booking or Sold, and at Sold, respectively |
| Responded | Leads with a recorded first response |
| Average response time | Mean minutes from capture to first response (status moved past New/Assigned, or first activity logged), weighted by responded leads |

## Cost metrics

| Metric | Definition |
|---|---|
| Cost per lead (provider) | Provider-reported spend / AutoSutra leads attributed to that provider, same filters and dates |
| Cost per lead (location) | Spend for the location's platforms / leads captured for the location |
| Cost per test drive (location) | Spend for the location / leads at Test drive completed or later |

These mix provider spend with AutoSutra counts on purpose: they answer "what did each enquiry cost us" using the dealership's own records. They are **not** the same as the provider's cost per result, which uses the provider's own conversion counting.

## Budget metrics

| Metric | Definition |
|---|---|
| Planned budget | Sum of lifetime budgets of all campaigns whose schedule overlaps the period |
| Approved budget | The same sum limited to campaigns that have been approved (ready to publish, pending funding, publishing, active, partially published, paused, completed) |
| Maximum authorised spend | Upper limit the approver authorised; spend reaching it triggers an automatic pause |
| Reported spend | Sum of provider-reported spend for the campaign's live platforms |

## Known reporting caveats

- Providers revise recent data for several days (late conversions, invalid click credits). AutoSutra re-fetches the whole campaign period on each sync, so recent figures can change.
- Time zones: provider daily rows follow the ad account's time zone. Use Asia/Kolkata on ad accounts to keep days aligned.
- Website enquiries can only be linked to a campaign when the landing URL carries UTM parameters; an alert is raised for live campaigns without them.
