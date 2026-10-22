# Meta and Google Ads API setup

**Start these applications now.** Provider approvals are usually the longest lead time in the project and do not depend on the product being finished.

Until every step for a provider is done, keep `ADS_META_MODE=demo` / `ADS_GOOGLE_MODE=demo`. In demo mode nothing is sent to the provider, publications are labelled Demo and no metrics are reported.

Going live needs both:
1. the environment variable set to `live`, and
2. the feature flag `live_meta_publishing` / `live_google_publishing` turned on by a super admin in **Admin → Feature flags** (with a recorded reason).

With the variable set but the flag off, customers see **Access pending** and cannot publish.

## Meta Marketing API

### Applications and approvals

1. **Meta Business Manager** for AutoSutra, with **business verification** completed (legal name, address, GST or incorporation documents).
2. **Meta developer app** (type: Business) owned by that Business Manager. Add the **Marketing API** product and **Facebook Login for Business**.
3. **App Review** for the permissions AutoSutra requests (`src/server/providers/meta.ts`, `META_SCOPES`):
   - `ads_management`, `ads_read`: create and read campaigns in the customer's ad account.
   - `business_management`: list the ad accounts the user can access through their business.
   - `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`: choose the Facebook Page that ads run from.
   - `leads_retrieval`: download instant-form leads (only needed for lead-form campaigns).
   Each needs a screencast and a description of use. Request **Advanced Access** for each; Standard Access only works with accounts that have a role on the app.
4. **Marketing API access tier**: start at Development tier (low rate limits, test accounts); apply for **Standard** tier once you have real usage. Rate-limit errors (codes 4, 17, 32, 613, 80000-80014) are retried with backoff by the job queue.
5. A **privacy policy URL** and **data deletion instructions URL** on the app (use `/privacy`).

### Configuration

```
ADS_META_MODE=live
META_APP_ID=...
META_APP_SECRET=...                    # server only
META_REDIRECT_URI=https://<your-domain>/api/oauth/meta/callback   # also add in the app's Valid OAuth Redirect URIs
META_GRAPH_VERSION=v23.0               # check Meta's changelog before upgrading
META_INITIAL_STATUS=PAUSED             # first live tests: keep PAUSED
```

### What AutoSutra creates

Per campaign: one campaign (objective `OUTCOME_TRAFFIC`, `OUTCOME_AWARENESS` or `OUTCOME_LEADS`), one ad set per targeted location with its own lifetime or daily budget in paise and a `custom_locations` radius, one creative from the selected Page, and one ad per ad set. Special ad categories are sent as empty; **review whether finance/EMI campaigns fall under a Meta special ad category in your markets** before enabling that objective live.

### Before switching to live (checklist)

- [ ] App review approved for all permissions above.
- [ ] A **test ad account** connected through `/app/settings/connections`.
- [ ] Publish a campaign to the test account with `META_INITIAL_STATUS=PAUSED`; verify in Ads Manager that campaign, ad sets (radius, budget, dates, age), creative and ads match the approval.
- [ ] Verify PIN-code targeting keys: AutoSutra sends `IN:<pincode>` zip keys; confirm them with the Targeting Search API for your markets, or leave PIN fields empty.
- [ ] Resume, pause, sync status and insights from the campaign page; confirm reported spend matches Ads Manager.
- [ ] Revoke the app from the test user's Facebook settings; confirm the connection turns *expired* and a notification appears.

## Google Ads API

### Applications and approvals

1. **Google Ads manager account (MCC)** for AutoSutra.
2. **Developer token** from API Center in that manager account. It starts in *Test account* access; apply for **Basic access** (application form describing the tool, with design documentation). Standard access is needed for higher volumes.
3. **Google Cloud project** with the Google Ads API enabled, an **OAuth consent screen** (External, scope `https://www.googleapis.com/auth/adwords`, which is sensitive and needs Google verification for production use) and an **OAuth client** of type Web application.
4. Customers either link their Google Ads account under AutoSutra's manager account (then set `GOOGLE_ADS_LOGIN_CUSTOMER_ID`) or authorise directly with their own login.

### Configuration

```
ADS_GOOGLE_MODE=live
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...               # server only
GOOGLE_REDIRECT_URI=https://<your-domain>/api/oauth/google/callback
GOOGLE_ADS_DEVELOPER_TOKEN=...         # server only
GOOGLE_ADS_LOGIN_CUSTOMER_ID=1234567890   # manager id without dashes, if used
GOOGLE_ADS_API_VERSION=v21             # versions sunset roughly yearly
GOOGLE_ADS_INITIAL_STATUS=PAUSED
```

### What AutoSutra creates

Per targeted location: a campaign budget (daily amount = lifetime budget spread over the schedule, or the daily budget you set), a Search campaign (Maximise clicks), a proximity criterion with the location's radius, one ad group, phrase-match keywords and a responsive search ad.

**Verify field names when changing `GOOGLE_ADS_API_VERSION`.** In particular the campaign date fields and required declarations (for example the EU political advertising field) have changed between versions.

### Before switching to live (checklist)

- [ ] Developer token has Basic access (test-account tokens cannot touch real accounts).
- [ ] OAuth consent screen verified for the adwords scope.
- [ ] Connect a Google Ads **test account**; publish with `PAUSED`; check budget, proximity radius, keywords and ad in the Google Ads UI.
- [ ] Sync status and metrics; confirm cost matches the UI (cost is reported in micros and converted to paise).
- [ ] Revoke access in the Google account's security settings; confirm the connection turns *expired*.

## Not yet implemented (by design, reported as unsupported)

Google Display / Video / Performance Max, Google lead-form and call assets, Meta call and click-to-WhatsApp ads, remarketing audiences, video creatives in live publishing, and language targeting on Google. See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).
