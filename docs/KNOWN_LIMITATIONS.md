# Known limitations and external dependencies

This is the honest status of the release. Nothing below should be described to customers as working until it has been tested in the corresponding environment.

## What has actually been tested

| Area | Tested how | Not tested |
|---|---|---|
| Auth, tenancy, roles, dealerships, locations, campaigns, approvals, leads, reports, ledger, wallet, refunds, reconciliation, billing | 61 Vitest service tests against a real PostgreSQL 16 database, including concurrency and database-trigger tests | Load and performance |
| Full campaign flow in a browser | Playwright: register, verify email, organisation, dealership, location, all builder steps, submit, approve, publish (demo), job run, demo status, audit trail, mobile layout at 375px | Other browsers than Chromium; screen readers |
| Meta and Google adapters | Unit tests against **mocked HTTP responses** (publish, retry after partial failure, error classification, pause, metrics) | **Never called the real Meta or Google APIs** |
| Payment gateway | Mock gateway with HMAC-signed webhooks through the real verification path | **Razorpay adapter never called against Razorpay** (test or live) |
| Storage | Local driver | **S3 driver never run against a real bucket** |
| Production build | `next build` succeeds | **Never deployed** to Vercel or any host |

## External dependencies blocking production

| Dependency | Blocks | Owner | Notes |
|---|---|---|---|
| Meta business verification, app review (Advanced Access for `ads_management`, `ads_read`, `business_management`, `pages_*`, `leads_retrieval`) | Live Meta publishing, Meta lead sync | AutoSutra | **Apply now**; see [PROVIDER_SETUP.md](PROVIDER_SETUP.md) |
| Google Ads developer token Basic access, OAuth consent screen verification for the `adwords` scope | Live Google publishing | AutoSutra | **Apply now** |
| Legal opinion on holding and allocating customer ad budgets; gateway approval; platform billing terms; GST advice | Central wallet and live deposits | AutoSutra with counsel and tax adviser | Dealer-funded mode works without these |
| Razorpay (or other gateway) account, KYC, webhook set-up; test-mode verification | Subscription and invoice payments online; deposits | AutoSutra | Invoices can be settled offline meanwhile |
| Transactional email provider and a driver in `src/server/email.ts` | Email verification, password reset, invitations in production | Engineering | Only the database outbox exists |
| S3-compatible bucket | Creative uploads in production | Engineering / ops | Production refuses to start with local storage |
| Commercial map tile provider | Maps in production | AutoSutra | OpenStreetMap public tiles are not for production use; add the host to the CSP |
| Counsel review of privacy policy, terms, cookie notice, DPA, consent wording | Launch | AutoSutra | Current texts are drafts |
| Hosting, database, monitoring accounts | Launch | AutoSutra | See [DEPLOYMENT.md](DEPLOYMENT.md) |

## Provider adapter caveats (verify during the first live test)

- **Google Ads API field names change between versions.** The adapter targets `v21`; check campaign date fields and newly required declarations (for example the EU political advertising field) against the version you deploy.
- **Meta PIN-code targeting** sends `IN:<pincode>` zip keys; confirm the key format with Meta's targeting search for your markets before relying on it. Radius targeting does not depend on this.
- Meta publishing creates **single-image** ads using the first uploaded image; carousel and video ads are not published.
- Google publishing creates **Search** campaigns only (responsive search ads, phrase-match keywords, proximity radius). Age and language targeting are not applied on Google.
- Only **INR** ad accounts are supported; other currencies are rejected during sync.
- Objectives marked unsupported in the builder: Meta call ads and click-to-WhatsApp; Google Display, Video, Performance Max, call assets and lead-form assets; Google awareness and event objectives. Remarketing and customer-list audiences are not offered.
- Meta's special ad category rules for financial products have not been reviewed for EMI and finance objectives.

## Product gaps

- No multi-factor authentication. Required before enabling the central wallet.
- No self-service account deletion; staff suspend users and remove memberships.
- Anonymising a lead clears the lead record and consent IP but not previously written activity notes (they are append-only).
- No recurring payment mandate (e-mandate / UPI AutoPay) for subscriptions; invoices are paid one at a time. No proration on plan changes (upgrades are invoiced for a full period, downgrades apply at renewal).
- Inventory is entered manually; no DMS or stock-feed integration.
- No server-side geocoding; staff place map pins themselves.
- The weekly performance summary is an in-app notification only, because email delivery is not wired up.
- English only.
- Rotating `TOKEN_ENCRYPTION_KEY` in place is not supported (customers would need to reconnect).

## Technical debt

- CSP allows `'unsafe-inline'` scripts (Next.js bootstrap). Move to nonce-based CSP.
- scrypt cost below OWASP's current recommendation; raise after measuring production latency.
- Catchment overlap uses a bounding-box prefilter and haversine distance, not PostGIS. Adequate for thousands of locations.
- Rate limiting and the job queue use PostgreSQL. Adequate for early scale; revisit at high request volumes.
- Dependabot, secret scanning and CI workflows are not configured in the repository.
