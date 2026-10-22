# Deployment

**Nothing has been deployed to production from this repository yet.** This document describes the intended set-up; each step must be verified in a real staging environment before production. For a quick hosted demo to open on a phone, see [PHONE_PREVIEW.md](PHONE_PREVIEW.md).

## Target set-up

| Component | Recommended | Notes |
|---|---|---|
| Web app | Vercel (Next.js) | Region `bom1` (Mumbai) keeps latency and data location close to customers |
| Database | Managed PostgreSQL 15+ in India (for example AWS RDS / Aurora `ap-south-1`, Neon or Supabase in Mumbai) | Point-in-time recovery on; see [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md) |
| Background jobs | Queued work runs right after the request that created it; Vercel Cron calls `/api/cron/run-jobs` for periodic work (status and metric sync every 15 minutes, reconciliation, billing, alerts); optionally `npm run worker` on a small always-on host (Railway, Render, Fly.io, ECS) | `vercel.json` ships with a **daily** cron because Vercel's Hobby plan allows no more. With live advertising, use a paid plan and change the schedule to `*/5 * * * *`, run the worker, or call the cron URL every 5 minutes from an external scheduler with the `CRON_SECRET` bearer token. All of these can run together safely. |
| Creative storage | S3-compatible bucket (AWS S3 `ap-south-1` or Cloudflare R2), private. `STORAGE_DRIVER=database` keeps files in PostgreSQL, which suits previews and small installs | Assets are served only through `/api/assets/[id]` after an access check. Vercel limits request bodies to 4.5 MB, so larger uploads fail there. |
| Email | A transactional provider with SMTP (Amazon SES `ap-south-1`, Postmark, Resend, SendGrid, Zoho) | `EMAIL_DRIVER=smtp`, see below |
| Error monitoring | Sentry or similar | `ERROR_MONITORING_DSN`; structured JSON logs go to stdout either way |
| Map tiles | A commercial tile provider | OpenStreetMap's public tiles are not for production traffic |

## Environments

Use three separate environments with **separate databases, buckets and secrets**: development (local), staging, production.

- Staging: `ADS_*_MODE=demo` or `live` against provider **test accounts** only; `PAYMENT_GATEWAY=razorpay` in test mode; `PAYMENTS_LIVE=false`.
- Production: start with `ADS_*_MODE=demo` (or `live` with feature flags off, which shows *Access pending*), `PAYMENTS_LIVE=false` and the `central_wallet` flag off.
- Never copy production data into staging without anonymising leads and users.

## Environment variables

All variables are documented in [`.env.example`](../.env.example). In production the app **refuses to start** if:

- `AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY` or `PAYMENT_WEBHOOK_SECRET` still have development defaults,
- `APP_URL` is not `https://`,
- `CRON_SECRET` is missing or shorter than 32 characters,
- `PAYMENTS_LIVE=true` with the mock gateway,
- `STORAGE_DRIVER=local`.

Generate secrets with `openssl rand -base64 48` (AUTH_SECRET, CRON_SECRET) and `openssl rand -base64 32` (TOKEN_ENCRYPTION_KEY). Store them in Vercel's encrypted environment variables and in the worker host's secret store, never in the repository.

## Steps (first deployment)

1. Create the database and a dedicated application role with rights on its own schema only.
2. Migrations run automatically in Vercel builds (`vercel-build` runs `db:migrate` before `next build`); elsewhere run `DATABASE_URL=... npm run db:migrate` from CI or a trusted machine. Do **not** seed production: `scripts/seed.ts` refuses when `APP_STAGE=production`.
3. Create the first super admin: register normally through `/register`, then in SQL:
   `UPDATE users SET platform_role = 'super_admin' WHERE email = '...';`
   and record who did it and why.
4. Create the Vercel project, link the repository, set the environment variables, region `bom1`.
5. Configure `vercel.json` cron (already present) and set `CRON_SECRET` in Vercel; Vercel sends it as `Authorization: Bearer <secret>`.
6. Optionally deploy the worker: `npm ci && npm run worker` with the same environment variables. On `SIGTERM` it stops claiming new jobs, finishes the current batch and exits; jobs interrupted by a hard kill are recovered by stale-lock recovery.
7. Configure the payment gateway webhook URL `https://<domain>/api/webhooks/payments/razorpay` with the `PAYMENT_WEBHOOK_SECRET`, events `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`.
8. Add the OAuth redirect URIs in the Meta app and Google Cloud console (see [PROVIDER_SETUP.md](PROVIDER_SETUP.md)).
9. If you change the map tile provider or payment gateway, add their hosts to the CSP in `next.config.ts`.
10. Smoke test on staging: register, verify email, create organisation, dealership, location, campaign, approve, publish (demo), check `/admin/jobs`.

## Email delivery (required before launch)

Set `EMAIL_DRIVER=smtp` with the provider's SMTP settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_TLS=starttls` for port 587 or `implicit` for 465) and an `EMAIL_FROM` address on a domain verified with the provider (SPF, DKIM and DMARC records). Each email is queued in the same transaction as the change that caused it, sent by the job queue, retried on temporary failures and not retried when the provider rejects it permanently. Message bodies, which contain one-time links, are removed after delivery. **Admin → Emails** shows status and errors.

The SMTP path is tested against a local SMTP server in the test suite; send a real verification and password reset email on staging before launch. With `EMAIL_DRIVER=outbox` nothing is delivered and users cannot verify their email or reset passwords themselves.

## Releases

- `npm run check` (lint, typecheck, unit tests, build) and `npm run test:e2e` must pass in CI before merging.
- Migrations are forward-only SQL files in `/drizzle`; review them like code. For destructive changes use expand/contract (add, backfill, switch, then drop in a later release).
- Vercel keeps previous deployments; roll back the app with "Promote to production" on the previous build. Database migrations are not rolled back automatically, which is why they must be backwards compatible with the previous app version.

## Health and monitoring

- `/admin/jobs` shows queue depth, failed and dead jobs, failed publication attempts and connection status.
- Alert on: dead jobs, cron route non-200, webhook signature failures (logged as `webhook_signature_invalid`, audited as `payment.webhook_rejected`), reconciliation differences, database CPU and connection count.
- Logs are single-line JSON with `level` and `msg`; ship them to your log platform from Vercel log drains and the worker host.
