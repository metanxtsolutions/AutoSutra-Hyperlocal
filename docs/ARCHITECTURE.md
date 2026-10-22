# Architecture

## Overview

```
Browser ──► Next.js (App Router)
              ├─ Server components (pages)        read via services
              ├─ Server actions (forms)           write via services
              ├─ Route handlers
              │    /api/webhooks/payments/[gw]    signed gateway webhooks
              │    /api/oauth/[provider]/callback Meta / Google OAuth
              │    /api/cron/run-jobs             Vercel Cron entry point
              │    /api/assets/[id]               access-checked media
              │    /api/*/export, statement       audited CSV exports
              └─ middleware                       cheap login redirect only

src/server/services  ── business rules, permission checks, audit, transactions
src/server/providers ── Meta / Google / demo adapters (provider details stay here)
src/server/payments  ── gateway abstraction (mock, Razorpay)
src/server/jobs      ── Postgres job queue, handlers, worker
src/server/db        ── Drizzle schema; SQL migrations in /drizzle
PostgreSQL           ── all state, including the job queue and rate limits
```

Every write goes through a service function that receives an `Actor` built on the server from the session. Services check permissions, validate input with Zod, run in a database transaction and append an audit record in the same transaction. Pages never query tenant data without going through a service that enforces the organisation and location scope.

## Tenancy and access control

- Every tenant-owned table has `organisation_id`. Services filter on it and on the actor's location scope (`locationScope`), so a branch manager limited to two locations cannot see other locations' campaigns or leads even by guessing ids.
- Cross-tenant access returns *Not found*, never *Forbidden*, so the existence of other tenants' records is not revealed.
- Roles live in `src/server/auth/permissions.ts`:
  - Organisation: owner, admin, marketing manager, branch manager, sales user, finance user, read-only analyst.
  - AutoSutra staff: super admin, finance admin, campaign operations manager.
  The matrix is code, reviewed with the code that depends on it. (The brief lists Role and Permission tables; a code-defined matrix was chosen deliberately so permission changes go through code review and tests. Assignments are stored in `organisation_memberships.role` and `users.platform_role`.)
- Staff permissions map onto organisation permissions only where explicitly listed (`STAFF_EQUIVALENT`), e.g. campaign operations can publish or pause **managed** campaigns but cannot approve a customer's budget.

## Campaign lifecycle

```
draft ─submit─► pending_approval ─approve─► ready_to_publish ─publish─► publishing ─► active / partially_published / demo_published
  ▲                │                │ (central wallet, short of funds)                  │
  └─request changes┘                └─► pending_funding ─funds reserved─► ready_to_publish
                                                                                       └─► paused / rejected / failed / completed / archived
```

- Approval stores a snapshot of the full configuration and its SHA-256 hash. Every edit increments `campaigns.version`; publishing recomputes the hash and refuses if it differs. This is what stops anyone, including AutoSutra operators, silently changing budget or targeting after the customer approved it.
- Overall status is derived from per-platform statuses (`deriveStatus`). A platform is shown as Active only when its adapter reports an active provider status. Demo publications have status `demo`.

## Provider adapters

`src/server/providers/types.ts` defines the neutral `AdsAdapter` contract (`publish`, `fetchStatus`, `fetchMetrics`, `setPaused`) and `ProviderError` with a kind (`auth`, `permission`, `rate_limit`, `validation`, `transient`) that drives retry decisions. Meta structures (ad sets, creatives) and Google structures (budgets, resource names, GAQL) never leave their adapter.

Objective mapping (`src/lib/objectives.ts`) states for each of the 17 automotive objectives which provider campaign type is used, which formats are available, what is required, and why a combination is unsupported. Unsupported is shown to users rather than approximated.

Idempotency: each external object id is written to `campaign_platforms.external_refs` immediately after the provider returns it, so a retry after a timeout resumes where it stopped. Publication attempts are recorded in `campaign_publication_attempts`.

## Background jobs

`jobs` table, claimed with `FOR UPDATE SKIP LOCKED`, exponential backoff, stale-lock recovery and idempotency keys. Types: `publish_platform`, `sync_platform`, `schedule_sync`, `meta_lead_sync`, `send_email`, `reconcile`, `billing_cycle`, `automation_scan`. They run right after the request that queued them (`processQueueSoon`, using Next.js `after`), in the long-running worker (`npm run worker`) and in bursts from Vercel Cron (`/api/cron/run-jobs`). Handlers that cannot succeed on retry throw `PermanentJobError`. Postgres was chosen over Redis to avoid an extra service at this stage; the queue interface is small enough to swap later.

## Money

See [FUNDING_MODEL.md](FUNDING_MODEL.md). In short: integer paise everywhere, a double-entry ledger whose entries and lines are append-only and balanced (both enforced by database triggers), separate accounts per money category, and reconciliation that compares the ledger with provider-reported spend and gateway records.

## Data model (main tables)

| Area | Tables |
|---|---|
| Identity | users, sessions, mfa_challenges, mfa_recovery_codes, email_tokens, rate_limits, outbound_emails |
| Tenancy | organisations, organisation_memberships, membership_locations, invitations |
| Dealerships | dealerships, dealership_locations, inventory_items |
| Providers | advertising_connections, provider_accounts, oauth_states |
| Campaigns | campaigns, campaign_targeting, campaign_platforms, campaign_budgets, campaign_creatives, creative_assets, creative_templates, campaign_approvals, campaign_notes, campaign_publication_attempts, platform_status_events, campaign_metric_snapshots |
| Leads | leads, lead_activities, consent_records |
| Billing | subscription_plans, subscriptions, invoices, invoice_lines |
| Funds | payments, payment_webhook_events, advertising_deposits, refunds, ledger_accounts, ledger_entries, ledger_lines, budget_reservations, provider_spend_records, reconciliation_runs, reconciliation_differences |
| Operations | notifications, support_tickets, support_ticket_messages, audit_logs, feature_flags, system_settings, contact_requests, jobs, stored_objects |

Append-only (database triggers): audit_logs, ledger_entries, ledger_lines, campaign_approvals, payment_webhook_events, lead_activities, provider_spend_records.

Geography: catchment overlap uses a bounding-box prefilter in SQL plus haversine distance in code (`src/lib/geo.ts`). PostGIS is not required at current scale; switch the prefilter to `ST_DWithin` on a geography column if location counts reach the tens of thousands.

## Key decisions

| Decision | Reason |
|---|---|
| Server actions + server components, no separate REST API for the UI | One validated service layer; Next.js server actions include origin checking against CSRF. Route handlers exist only where an external system calls in. |
| Drizzle + SQL migrations | Explicit SQL, easy to add triggers and constraints the ORM cannot express. |
| Demo mode instead of a "fake live" mode | The product must never show fabricated results; demo publications are labelled and produce no metrics. |
| Objects created PAUSED by default on providers | First live publications cannot spend until someone deliberately resumes them. Configurable per provider. |
| Dealer-funded default | Central custody of customer funds needs legal, gateway and platform approval first. |
