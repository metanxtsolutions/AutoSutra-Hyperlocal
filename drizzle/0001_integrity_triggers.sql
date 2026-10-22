-- Append-only enforcement: posted financial records, approvals and audit history
-- can never be updated or deleted. Corrections are made with new compensating rows.
CREATE OR REPLACE FUNCTION autosutra_forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION autosutra_forbid_change();
--> statement-breakpoint
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION autosutra_forbid_change();
--> statement-breakpoint
CREATE TRIGGER ledger_lines_append_only BEFORE UPDATE OR DELETE ON ledger_lines
  FOR EACH ROW EXECUTE FUNCTION autosutra_forbid_change();
--> statement-breakpoint
CREATE TRIGGER campaign_approvals_append_only BEFORE UPDATE OR DELETE ON campaign_approvals
  FOR EACH ROW EXECUTE FUNCTION autosutra_forbid_change();
--> statement-breakpoint
CREATE TRIGGER webhook_events_append_only BEFORE UPDATE OR DELETE ON payment_webhook_events
  FOR EACH ROW EXECUTE FUNCTION autosutra_forbid_change();
--> statement-breakpoint
CREATE TRIGGER lead_activities_append_only BEFORE UPDATE OR DELETE ON lead_activities
  FOR EACH ROW EXECUTE FUNCTION autosutra_forbid_change();
--> statement-breakpoint
CREATE TRIGGER provider_spend_append_only BEFORE UPDATE OR DELETE ON provider_spend_records
  FOR EACH ROW EXECUTE FUNCTION autosutra_forbid_change();
--> statement-breakpoint
-- Double-entry enforcement: when a transaction commits, every ledger entry it
-- touched must have equal debits and credits, and match the entry amount.
CREATE OR REPLACE FUNCTION autosutra_check_entry_balanced() RETURNS trigger AS $$
DECLARE
  d bigint;
  c bigint;
  amt bigint;
BEGIN
  SELECT COALESCE(SUM(debit_paise), 0), COALESCE(SUM(credit_paise), 0)
    INTO d, c FROM ledger_lines WHERE entry_id = NEW.entry_id;
  SELECT amount_paise INTO amt FROM ledger_entries WHERE id = NEW.entry_id;
  IF d <> c THEN
    RAISE EXCEPTION 'ledger entry % does not balance (debits %, credits %)', NEW.entry_id, d, c
      USING ERRCODE = 'check_violation';
  END IF;
  IF d <> amt THEN
    RAISE EXCEPTION 'ledger entry % lines total % but entry amount is %', NEW.entry_id, d, amt
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_lines_balanced AFTER INSERT ON ledger_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION autosutra_check_entry_balanced();
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS ledger_transaction_seq;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;
