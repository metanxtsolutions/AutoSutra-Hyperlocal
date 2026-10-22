# Security

## Controls in place

| Area | Control | Where |
|---|---|---|
| Passwords | scrypt (N=2^15, r=8, p=1, per-user salt), minimum 10 characters, constant-time comparison, dummy hash for unknown emails to equalise timing | `src/server/crypto.ts`, `services/auth.ts` |
| Sessions | 256-bit random token in an httpOnly, SameSite=Lax cookie, Secure whenever `APP_URL` is https; only an HMAC of the token is stored; 12-hour lifetime; all sessions revoked on password reset, suspension or staff role change | `auth/session.ts` |
| Email tokens | Single use, hashed at rest, short expiry (verification 48 h, password reset 60 min), purpose-bound | `services/auth.ts` |
| Rate limiting | Postgres sliding window on login (IP and email), registration, password reset, verification resend, public enquiry and contact forms, organisation creation and invitations | `rate-limit.ts` |
| Authorisation | Every service checks permissions server-side from the session; tenant and location scoping on every query; cross-tenant ids return Not found; staff powers limited and audited | `auth/context.ts`, `auth/permissions.ts` |
| CSRF | Server actions verify the Origin header (Next.js); cookies are SameSite=Lax; OAuth uses a hashed, single-use `state` that expires after 10 minutes and is bound to the user and organisation | |
| Input validation | Zod schemas on every action and route; upload type checked by magic bytes, not the file name; size and dimension limits | `validation.ts`, `storage.ts` |
| Provider tokens | AES-256-GCM with `TOKEN_ENCRYPTION_KEY`, never sent to the browser, never logged | `crypto.ts`, `providers/registry.ts` |
| Webhooks | HMAC signature verified over the raw body with constant-time comparison; event id stored once; amount verified; replays ignored; rejected signatures are logged (`webhook_signature_invalid`) and audited | `api/webhooks/payments`, `services/payments.ts` |
| Cron | Bearer secret compared in constant time; 401 otherwise | `api/cron/run-jobs` |
| Financial integrity | Append-only ledger and audit tables, balanced-entry constraint trigger, idempotency keys, row locks on balance checks, two-person approval for reconciliation adjustments, typed confirmation for refunds and flag changes | migrations `0001`, `0005` |
| Audit | Append-only `audit_logs` written in the same transaction as the change (actor, organisation, entity, summary, IP) | `audit.ts` |
| Headers | CSP, HSTS (2 years), X-Frame-Options DENY, frame-ancestors none, nosniff, strict referrer policy, restrictive permissions policy | `next.config.ts` |
| Secrets | Server-only variables (no `NEXT_PUBLIC_` prefix); production refuses to start with development secrets | `env.ts` |
| Production guards | `/dev/outbox` returns 404 in production; mock gateway refused when `PAYMENTS_LIVE=true`; local storage refused in production | |
| Exports | Lead, report and wallet statement exports require specific permissions and are audited (with row counts for leads and statements) | `api/*/export` |

## Known gaps and hardening backlog

- **CSP uses `'unsafe-inline'` for scripts** because Next.js injects inline bootstrap scripts. Move to nonce-based CSP via middleware before handling payments at scale.
- **No multi-factor authentication** yet. Add TOTP for owners, finance users and all AutoSutra staff before enabling the central wallet.
- scrypt cost is below OWASP's current recommendation for interactive logins (N=2^17); raise it once login latency on production hardware is measured. Hashes record their parameters, so existing hashes keep working.
- No malware scanning of uploads (images are sniffed by magic bytes and re-served with their verified content type; add a scanner if video or document uploads are opened up).
- No automated dependency or secret scanning configured in CI (enable GitHub Dependabot and secret scanning).
- Session list and "sign out other devices" UI not built (sessions are revoked on password reset).
- Penetration test not yet performed.

## Pre-launch security checklist

- [ ] All production secrets generated fresh and stored only in the hosting secret stores.
- [ ] `TOKEN_ENCRYPTION_KEY` backed up securely (losing it means every customer must reconnect Meta and Google).
- [ ] Database not publicly reachable, TLS enforced, least-privilege application role.
- [ ] Storage bucket private; no public ACLs.
- [ ] Super admin accounts limited to named people; MFA on hosting, database, GitHub, Meta Business Manager, Google Ads manager account and payment gateway dashboards.
- [ ] Error monitoring configured with PII scrubbing.
- [ ] Webhook secret configured in the gateway and verified with a test event on staging.
- [ ] Dependabot and secret scanning on.
- [ ] External penetration test, findings fixed.
- [ ] Incident contacts and the process below agreed.

## Secret rotation

| Secret | Rotation effect | Procedure |
|---|---|---|
| `AUTH_SECRET` | Invalidates all sessions and outstanding email and OAuth tokens | Set the new value, redeploy app and worker; users sign in again |
| `TOKEN_ENCRYPTION_KEY` | Stored provider tokens become unreadable | Not supported in place yet: requires a re-encryption script reading with the old key. Until then, rotation means customers reconnect. |
| `CRON_SECRET` | Cron calls fail until Vercel has the new value | Update in Vercel and redeploy |
| `PAYMENT_WEBHOOK_SECRET` | Webhooks fail signature checks until both sides match | Change in the gateway dashboard and in the app at the same time; failed events can be re-sent from the gateway |
| Provider app secrets | OAuth exchanges fail until updated | Rotate in Meta/Google, update env, redeploy |

## Incident response

1. **Detect and record**: open an incident record with time, reporter and what is known.
2. **Contain**: suspend affected users (`/admin/users`), suspend an organisation (`/admin/organisations`), turn off `live_meta_publishing` / `live_google_publishing` / `live_deposit_collection` flags, rotate secrets as above. Pause live campaigns from the campaign page if spend is at risk.
3. **Assess**: use `/admin/audit` and database logs to determine what data and which organisations were affected.
4. **Notify**: under the DPDP Act 2023 and its Rules, a personal data breach must be reported to the Data Protection Board and to affected Data Principals in the prescribed form and time; CERT-In directions (2022) require reporting specified cyber incidents within 6 hours. Confirm current obligations with counsel. Notify affected customers (who are data fiduciaries for their own leads) without delay.
5. **Recover**: restore from backup if needed (see [BACKUP_RECOVERY.md](BACKUP_RECOVERY.md)), run ledger integrity checks.
6. **Review**: write a post-incident review with root cause and actions.

## Reporting a vulnerability

Publish a `security@` address and a `/.well-known/security.txt` before launch.
