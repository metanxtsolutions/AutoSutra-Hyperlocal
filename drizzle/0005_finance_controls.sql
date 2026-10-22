ALTER TABLE "payments" ADD COLUMN "refunded_amount_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reconciliation_differences" ADD COLUMN "proposed_adjustment" jsonb;--> statement-breakpoint
ALTER TABLE "reconciliation_differences" ADD COLUMN "proposed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "reconciliation_differences" ADD COLUMN "proposed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reconciliation_differences" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "bank_reference" text;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "reconciliation_differences" ADD CONSTRAINT "reconciliation_differences_proposed_by_id_users_id_fk" FOREIGN KEY ("proposed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;