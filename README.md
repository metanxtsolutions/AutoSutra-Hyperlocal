# AutoSutra Hyperlocal Ads

Automotive hyperlocal advertising management for India: dealerships and dealer groups plan, approve, publish and measure Meta Ads and Google Ads campaigns around each showroom, service centre or pre-owned outlet, and track enquiries through to test drives and sales.

> **Status: release candidate for controlled onboarding, not production-launched.**
> Live advertising, live payments and centralised budget collection are **off by default** and stay off until the access, approvals and legal review listed in [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) are complete. The Meta and Google adapters have been tested only against mocked APIs.

## What is in the box

| Area | Highlights |
|---|---|
| Public website | Home (13 sections), features, how it works, automotive solutions, dealer groups, managed advertising, pricing (from the database), contact, privacy, terms, cookies |
| Accounts | Email/password with scrypt, email verification, password reset, rate limiting, hashed session tokens, invitations, two-step verification (authenticator app and recovery codes; required for staff and money movements), SMTP email delivery |
| Tenancy and roles | Organisations (independent dealer, dealer group, agency), 7 organisation roles and 3 AutoSutra staff roles, location-limited access, server-side enforcement on every query |
| Dealerships and locations | Brands, category, type, GSTIN, verification; locations with map pin, radius, permitted / excluded PIN codes, supported objectives, monthly budget limit, lead routing; territory overlap warnings with audited override |
| Campaign builder | Seven screens with a progress stepper: location, objective and product with claims (17 automotive objectives mapped to real provider campaign types), platforms, targeting and audience, budget per platform and location, creative with uploads and previews, review |
| Approvals | Customer approval bound to a SHA-256 configuration fingerprint; separation of duties; claims confirmation; managed-service sign-off by AutoSutra operations; operators cannot raise authorised spend |
| Publishing | Meta Marketing API and Google Ads API adapters, demo adapter, background job queue with retries, idempotent per-step publishing, per-platform status exactly as reported, sync of status and metrics, spend alerts, auto-pause at the authorised maximum |
| Money | Double-entry append-only ledger, dealer-funded default, central wallet behind a flag, verified webhooks, refunds with finance approval, reconciliation with two-person adjustments, subscriptions and GST invoices |
| Leads | Hosted enquiry and test-drive forms, Meta instant-form sync, CSV import with consent evidence, duplicates, routing, status history, response time, consent withdrawal, anonymisation, retention, audited export |
| Reporting | Provider-separated metrics with attribution notes, captured-to-sold funnel, cost per enquiry and test drive, location and platform views, freshness warnings, CSV export |
| Operations | Admin console: organisations, users, campaign ops, connections, jobs and API health, emails, ledger, payments, refunds, reconciliation, plans, feature flags, support, audit |
| Phone | Installable web app (manifest, icons, offline page) and an Android app (Trusted Web Activity) built by GitHub Actions; see [docs/PHONE_PREVIEW.md](docs/PHONE_PREVIEW.md) |

## Stack

Next.js 15 (App Router, server actions) · TypeScript · Tailwind CSS 4 · PostgreSQL 16 · Drizzle ORM with SQL migrations · Zod · Postgres-backed job queue · Leaflet maps · Vitest and Playwright. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Local setup

Requirements: Node.js 20.18+ (22 recommended), PostgreSQL 14+.

```bash
# 1. Install
npm install

# 2. Database (example for a local Postgres superuser "postgres")
createuser -P autosutra          # password: autosutra (development only)
createdb -O autosutra autosutra_dev
createdb -O autosutra autosutra_test

# 3. Configuration
cp .env.example .env.local      # development defaults work as-is; never commit real secrets

# 4. Schema and demo data
npm run db:migrate
npm run db:seed                 # demo users and sample activity; password autosutra-dev-2026

# 5. Run the app and the background worker (two terminals)
npm run dev                     # http://localhost:3000
npm run worker                  # publishing, sync, reconciliation, billing, alerts
```

Seeded accounts (development only): `admin@autosutra.local` (super admin), `finance@autosutra.local`, `ops@autosutra.local`, `owner@demo-motors.local` (dealer owner), `sales@demo-motors.local`.

The seed also gives Demo Motors Group sample activity (`scripts/seed-sample.ts`), once (it skips if sample campaigns already exist, and never changes existing records): a campaign published in demo mode, one waiting for approval, a draft, and 17 enquiries at different stages. Every sample record is labelled "(sample)". No provider spend or delivery is invented, so spend figures stay at ₹0 and cost figures show "–".

Development helpers:

- `/dev/outbox` shows emails (verification and reset links). Not available in production.
- With `PAYMENT_GATEWAY=mock`, `/pay/[id]` offers "simulate success / failure" buttons that send a **signed webhook through the same verification path** a real gateway uses.
- Providers default to **demo mode**: publishing is simulated, labelled "Demo", never shown as Active, and reports no metrics.

## Checks

```bash
npm run lint         # ESLint (next/core-web-vitals + TypeScript)
npm run typecheck    # tsc --noEmit
npm test             # Vitest service tests against Postgres (autosutra_test)
npm run build        # production build
npm run test:e2e     # Playwright end-to-end flow (needs Chromium; see playwright.config.ts)
npm run check        # lint + typecheck + test + build
```

Service tests rebuild the `autosutra_test` schema from migrations on every run. Set `TEST_DATABASE_URL` to use another database. End-to-end tests use `autosutra_e2e` and a dev server on port 3200; set `PLAYWRIGHT_CHROMIUM_PATH` if Playwright's own browser is not installed.

## Documentation

| Document | Contents |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Modules, data model, tenancy, jobs, adapters, key decisions |
| [PROVIDER_SETUP.md](docs/PROVIDER_SETUP.md) | Meta and Google Ads API access, app review, OAuth, going live |
| [FUNDING_MODEL.md](docs/FUNDING_MODEL.md) | Dealer-funded vs central wallet, ledger accounts, approvals needed before enabling |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vercel + managed Postgres + worker, environments, cron, email, storage |
| [PHONE_PREVIEW.md](docs/PHONE_PREVIEW.md) | Hosted demo on a phone: install from the browser or the Android APK |
| [SECURITY.md](docs/SECURITY.md) | Security controls, compliance checklist, incident response |
| [COMPLIANCE.md](docs/COMPLIANCE.md) | DPDP Act notes, consent, data subject requests, subprocessors, DPA template |
| [BACKUP_RECOVERY.md](docs/BACKUP_RECOVERY.md) | Backups, restore drills, ledger integrity checks |
| [ADMIN_RUNBOOK.md](docs/ADMIN_RUNBOOK.md) | Day-to-day operations, finance procedures, alerts |
| [USER_GUIDE.md](docs/USER_GUIDE.md) | For dealership users |
| [METRICS.md](docs/METRICS.md) | Metric definitions and platform differences |
| [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Tokens, components, chart palette |
| [KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) | What is not done, and the external dependencies blocking production |
