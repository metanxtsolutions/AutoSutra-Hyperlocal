# Backup and recovery

## What must be protected

| Asset | Why | Backup |
|---|---|---|
| PostgreSQL database | All business data, ledger, audit trail, job queue | Managed automated backups with point-in-time recovery (PITR), retention at least 35 days, plus a weekly logical dump retained for 1 year in a separate account |
| Creative storage bucket | Uploaded images and videos | Bucket versioning on, lifecycle rule keeping non-current versions 90 days, cross-region replication optional |
| `TOKEN_ENCRYPTION_KEY` | Decrypts stored Meta/Google tokens | Stored in two separate secret managers or an offline sealed record held by two named people |
| Other secrets | Restore service | Hosting secret stores; documented regeneration (see [SECURITY.md](SECURITY.md)) |

Targets (to be confirmed with the business): recovery point objective 5 minutes (PITR), recovery time objective 4 hours.

## Restore procedure

1. Declare an incident and freeze changes: turn off `live_*` feature flags, stop the worker and disable the Vercel cron (remove the schedule or rotate `CRON_SECRET`).
2. Restore the database to a **new instance** at the chosen point in time. Never restore over the live database.
3. Run the integrity checks below against the restored instance.
4. Point `DATABASE_URL` for the app and worker at the restored instance; redeploy.
5. Re-enable the worker and cron. Jobs that were in flight are recovered by stale-lock recovery; publishing is idempotent per step because external ids are saved as soon as providers return them.
6. **Reconcile with the outside world**, because providers and the gateway did not roll back:
   - Run *Sync status* on every live campaign platform; compare with Ads Manager and Google Ads.
   - In the gateway dashboard, list payments and refunds since the restore point and re-send their webhooks; dedupe by event id makes this safe.
   - Run a reconciliation for each affected day in `/admin/finance/reconciliation`.
7. Record the incident and what was replayed.

## Integrity checks

```sql
-- 1. Every ledger entry balances (also enforced by trigger at commit)
SELECT e.id, e.transaction_id
FROM ledger_entries e JOIN ledger_lines l ON l.entry_id = e.id
GROUP BY e.id, e.transaction_id, e.amount_paise
HAVING sum(l.debit_paise) <> sum(l.credit_paise) OR sum(l.debit_paise) <> e.amount_paise;

-- 2. Trial balance: total debits equal total credits
SELECT sum(debit_paise) - sum(credit_paise) AS difference FROM ledger_lines;   -- expect 0 (NULL on an empty ledger)

-- 3. Confirmed deposits have a ledger entry
SELECT id FROM advertising_deposits WHERE status = 'confirmed' AND ledger_entry_id IS NULL;

-- 4. No customer available balance is negative (liability accounts carry credit balances)
SELECT a.code, sum(l.credit_paise) - sum(l.debit_paise) AS balance
FROM ledger_accounts a JOIN ledger_lines l ON l.account_id = a.id
WHERE a.code LIKE 'org:%:available'
GROUP BY a.code HAVING sum(l.credit_paise) - sum(l.debit_paise) < 0;

-- 5. Append-only triggers are present
SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname LIKE '%append_only%' OR tgname LIKE '%balanced%';
```

Column names follow `src/server/db/schema.ts`; adjust if the schema changes.

## Drills

- Quarterly: restore the latest backup into a scratch instance, run the integrity checks, start the app against it in a staging environment and sign in.
- After any schema migration that touches financial tables: run checks 1 to 4 on staging and production.
- Record each drill (date, backup used, duration, issues).
